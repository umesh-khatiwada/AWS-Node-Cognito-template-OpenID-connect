import boto3
import json
import os

# Initialize S3 client with explicit region
s3 = boto3.client('s3', region_name='us-east-1')
BUCKET_NAME = os.environ.get('BUCKET_NAME', 'horyzon-input-np')  # Default to bucket name if not set

def lambda_handler(event, context):
    # Check if body exists
    if not event.get('body'):
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing request body"})
        }

    try:
        # Handle nested body from API Gateway
        body = json.loads(event['body'])
        if isinstance(body.get('body'), str):
            body = json.loads(body['body'])  # Parse nested body
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON in request body"})
        }

    file_name = body.get('file_name')
    if not file_name:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "file_name is required"})
        }

    try:
        # Generate presigned URL with ContentType
        presigned_url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': file_name,
                'ContentType': 'video/mp4'  # Match client Content-Type
            },
            ExpiresIn=900  # 15 minutes
        )
        return {
            "statusCode": 200,
            "body": json.dumps({
                "upload_url": presigned_url,
                "file_name": file_name
            })
        }
    except Exception as e:
        print(f"Error generating presigned URL: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }