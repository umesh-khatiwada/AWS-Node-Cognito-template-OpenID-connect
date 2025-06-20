from boto3.dynamodb.conditions import Attr
import json
import boto3

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('db-table')

def lambda_handler(event, context):
    user_id = event.get('pathParameters', {}).get('user-id')

    if not user_id:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'Missing user-id in path parameters'})
        }

    try:
        response = table.scan(
            FilterExpression=Attr('userId').eq(user_id)
        )

        items = response.get('Items', [])

        if not items:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'No items found for userId {user_id}'})
            }

        return {
            'statusCode': 200,
            'body': json.dumps(items),
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            }
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
