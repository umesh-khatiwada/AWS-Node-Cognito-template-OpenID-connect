# AWS Lambda Video Processing Pipeline

This application leverages AWS Lambda and other AWS services to handle end-to-end video processing—from upload to adaptive streaming playback.

---

## 📦 Architecture Overview

The system consists of four main Lambda functions orchestrated with S3, MediaConvert, MediaPackage, DynamoDB, and API Gateway.

---

## 🚀 Lambda Functions

### 1. **Generate Presigned URL**
- **File:** `step1_generate-presigned-url.py`
- **Purpose:** Generates a presigned S3 URL to securely upload videos.
- **Trigger:** `POST /upload` (API Gateway)
- **Environment Variables:**
  - `BUCKET_NAME`
  - `AWS_REGION`

### 2. **Convert Uploaded Media**
- **File:** `step2_convert_uploaded_media.py`
- **Purpose:** Converts uploaded videos to HLS format using MediaConvert and generates thumbnails.
- **Trigger:** S3 event (on video upload)
- **Operations:**
  - Initiates MediaConvert jobs
  - Generates multi-bitrate outputs (e.g., 720p, 360p)
  - Creates video thumbnails at specific intervals
  - Stores thumbnail URLs in DynamoDB

### 3. **MediaPackage Integration**
- **File:** `step3_use_media_package.py`
- **Purpose:** Sets up MediaPackage channels and endpoints.
- **Operations:**
  - Creates MediaPackage channels
  - Configures HLS packaging and endpoints
  - Manages content delivery settings

### 4. **Video List Manager**
- **File:** `step4_fetch_video_list.py`
- **Purpose:** Manages video metadata and retrieves user-specific listings.
- **Trigger:** `GET /videos` (API Gateway)
- **Features:**
  - Stores metadata in DynamoDB
  - Provides playback URLs
  - Filters videos per user
  - Manages thumbnail URLs

---

## 🔒 IAM Roles & Permissions

Each Lambda function must be assigned an IAM role with permissions to access the necessary AWS resources.

### Required Policy Example:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "mediaconvert:CreateJob",
        "mediapackage:CreateChannel",
        "dynamodb:PutItem",
        "dynamodb:Query"
      ],
      "Resource": "*"
    }
  ]
}
````
