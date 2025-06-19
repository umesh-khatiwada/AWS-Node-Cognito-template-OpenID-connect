#!/usr/bin/env python

import json
import os
import uuid
import boto3
import datetime
import urllib.request
from botocore.exceptions import ClientError

def handler(event, context):
    print("Received event:", json.dumps(event))  # Debug log

    # Step 1: Parse the body from API Gateway event
    try:
        body = json.loads(event.get('body', '{}'))
        item = body.get('Item', {})
        sourceS3Key = item.get('fileName')
        userId = item.get('userId', 'unknown')
        userEmail = item.get('userEmail', 'unknown@example.com')
    except Exception as parse_error:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f'Invalid request body: {str(parse_error)}'}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }

    # Validate required input
    if not sourceS3Key:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing fileName in body.Item'}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }

    # Step 2: Setup
    assetID = str(uuid.uuid4())
    sourceS3Bucket = os.environ['SourceBucket']
    destinationS3 = f's3://{os.environ["DestinationBucket"]}'
    mediaConvertRole = os.environ['MediaConvertRole']
    region = os.environ['AWS_DEFAULT_REGION']
    dynamodb_table_name = os.environ.get('DynamoDBTable', 'horyzon-db-table')

    sourceS3 = f's3://{sourceS3Bucket}/{sourceS3Key}'
    sourceS3Basename = os.path.splitext(os.path.basename(sourceS3))[0]
    jobMetadata = {'assetID': assetID}
    api_url = f"https://brz8v7rkb1.execute-api.us-east-1.amazonaws.com/dev/{assetID}"

    try:
        # Step 3: Load MediaConvert job template
        with open('job.json') as f:
            jobSettings = json.load(f)

        # Step 4: Get MediaConvert endpoint
        mc_client = boto3.client('mediaconvert', region_name=region)
        endpoints = mc_client.describe_endpoints()
        client = boto3.client(
            'mediaconvert',
            region_name=region,
            endpoint_url=endpoints['Endpoints'][0]['Url'],
            verify=False  # Disable cert verification (consider enabling in prod)
        )

        # Step 5: Customize job settings
        jobSettings['Inputs'][0]['FileInput'] = sourceS3

        S3KeyHLS = f'assets/{assetID}/HLS/{sourceS3Basename}'
        jobSettings['OutputGroups'][0]['OutputGroupSettings']['HlsGroupSettings']['Destination'] = f'{destinationS3}/{S3KeyHLS}'

        S3KeyWatermark = f'assets/{assetID}/MP4/{sourceS3Basename}'
        jobSettings['OutputGroups'][1]['OutputGroupSettings']['FileGroupSettings']['Destination'] = f'{destinationS3}/{S3KeyWatermark}'

        S3KeyThumbnails = f'assets/{assetID}/Thumbnails/{sourceS3Basename}'
        jobSettings['OutputGroups'][2]['OutputGroupSettings']['FileGroupSettings']['Destination'] = f'{destinationS3}/{S3KeyThumbnails}'

        print("Final MediaConvert job settings:")
        print(json.dumps(jobSettings))

        # Step 6: Submit MediaConvert job
        job = client.create_job(
            Role=mediaConvertRole,
            UserMetadata=jobMetadata,
            Settings=jobSettings
        )

        print("MediaConvert job created:", json.dumps(job, default=str))

        # Step 7: Save metadata to DynamoDB
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(dynamodb_table_name)

        table.put_item(
            Item={
                'id': assetID,
                'SK': 'METADATA',
                'videoId': assetID,
                'fileName': item.get('fileName'),
                'userId': userId,
                'userEmail': userEmail,
                's3SourceUrl': f'https://{sourceS3Bucket}.s3.amazonaws.com/{sourceS3Key}',
                'playbackUrls': [],
                'status': 'submitted',
                'uploadedAt': datetime.datetime.utcnow().isoformat()
            }
        )

        print("Metadata saved to DynamoDB.")

        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Job submitted', 'videoId': assetID}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }

    except Exception as e:
        print("Error occurred:", str(e))
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)}),
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        }
