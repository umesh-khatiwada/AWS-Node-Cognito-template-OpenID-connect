# AWS-Node-Cognito-template-OpenID-connect

A secure video processing and streaming platform using AWS services with Cognito authentication.

## Architecture
![Architecture Diagram](./assets/mediaconvert.drawio.png)

## Features

- 🔒 Secure Authentication with AWS Cognito OpenID Connect
- 📹 Video Upload & Processing
- 🎥 Adaptive Bitrate Streaming (HLS)
- 🎮 Quality Selection Controls
- 📱 Responsive Design
- 🚀 Scalable Architecture

## Prerequisites

- Node.js >= 18.0.0
- AWS Account with configured services:
  - Cognito User Pool
  - S3 Bucket
  - MediaConvert
  - MediaPackage
  - DynamoDB
  - Lambda
  - API Gateway

## Quick Start

1. Clone and Install:
```bash
git clone [repository-url]
cd cognition
npm install
```

2. Configure Environment:
Create `.env` file in root directory:
```env
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=your_user_pool_id
COGNITO_CLIENT_ID=your_client_id
COGNITO_CLIENT_SECRET=your_client_secret
COGNITO_DOMAIN=your_cognito_domain
SESSION_SECRET=your_session_secret
API_GATEWAY_URL=your_api_gateway_url
PORT=3000
```

3. Start Server:
```bash
npm start
```

## Project Structure
