import json
import boto3
import time
import os
import traceback

def lambda_handler(event, context):
    print("Lambda triggered.")
    print("Event received:")
    print(json.dumps(event, indent=2))

    try:
        packaging_group_id = os.environ.get('PACKAGING_GROUP_ID')
        source_role_arn = os.environ.get('SOURCE_ROLE_ARN')
        dynamodb_table = os.environ.get('DYNAMODB_TABLE', 'horyzon-db-table')

        if not packaging_group_id or not source_role_arn:
            raise Exception("Environment variables PACKAGING_GROUP_ID or SOURCE_ROLE_ARN are not set.")

        empvod = boto3.client('mediapackage-vod')
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(dynamodb_table)

        # Get HLS playlist
        output_groups = event.get("detail", {}).get("outputGroupDetails", [])
        hls_playlist_paths = []

        for output in output_groups:
            if output.get("type") == "HLS_GROUP":
                hls_playlist_paths = output.get("playlistFilePaths", [])

        print("Extracted HLS playlist paths:", hls_playlist_paths)

        if not hls_playlist_paths:
            print("No HLS playlist found. Exiting.")
            return {
                'statusCode': 200,
                'body': json.dumps("No HLS playlist found.")
            }

        for hls_path in hls_playlist_paths:
            print(f"Processing HLS playlist path: {hls_path}")

            try:
                empvod.describe_packaging_group(Id=packaging_group_id)
                print(f"Packaging group {packaging_group_id} exists.")
            except empvod.exceptions.NotFoundException:
                print(f"Packaging group {packaging_group_id} not found. Creating it...")
                empvod.create_packaging_group(Id=packaging_group_id)

            # Validate and parse S3 path
            if hls_path.startswith("s3://"):
                source_arn = "arn:aws:s3:::" + hls_path[len("s3://"):]
            else:
                raise Exception(f"Invalid S3 path: {hls_path}")

            asset_basename = os.path.basename(hls_path).split(".")[0]
            asset_id = asset_basename + str(int(time.time()))
            print(f"Creating asset with ID: {asset_id} from source: {source_arn}")

            asset_response = empvod.create_asset(
                Id=asset_id,
                PackagingGroupId=packaging_group_id,
                SourceArn=source_arn,
                SourceRoleArn=source_role_arn
            )

            print("Asset created:", json.dumps(asset_response, indent=2))

            # Extract playback URL (assume first EgressEndpoint)
            playback_url = asset_response.get("EgressEndpoints", [{}])[0].get("Url")
            if not playback_url:
                raise Exception("No playback URL found in MediaPackage VOD asset response.")

            # Extract original asset ID from MediaConvert metadata
            assetID_from_metadata = event.get("detail", {}).get("userMetadata", {}).get("assetID")
            if not assetID_from_metadata:
                raise Exception("No assetID found in MediaConvert userMetadata.")

            print(f"Updating DynamoDB record with id = {assetID_from_metadata}")
            print(f"Playback URL = {playback_url}")

            # Update DynamoDB record
            table.update_item(
                Key={
                'id': assetID_from_metadata
            },
            UpdateExpression='SET playbackUrls = :val1',
            ExpressionAttributeValues={
                ':val1': [playback_url]
            }
            )
            print("DynamoDB record updated successfully.")

        return {
            'statusCode': 200,
            'body': json.dumps("Assets created and DynamoDB updated successfully.")
        }

    except Exception as e:
        print("ERROR:")
        traceback.print_exc()
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }
