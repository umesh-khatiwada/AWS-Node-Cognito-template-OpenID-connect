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
```

# Lambda Functions for Video Processing

This directory contains AWS Lambda functions for a complete video processing pipeline with thumbnail generation and Netflix-like streaming experience.

## Overview

The video processing pipeline consists of 4 main Lambda functions that work together to handle video uploads, processing, and streaming with a professional media player:

1. **step1_generate-presigned-url.py** - Generates secure S3 upload URLs
2. **step2_convert_uploaded_media.py** - Processes videos and generates thumbnails
3. **step3_use_media_package.py** - Sets up streaming endpoints
4. **step4_fetch_video_list.py** - Manages video metadata and thumbnails

## Media Player Integration

The frontend now uses **Video.js** - a professional HTML5 video player used by major streaming platforms including Netflix adaptations. Key features include:

### Video.js Features
- **HLS Streaming Support**: Native support for adaptive bitrate streaming
- **Quality Selection**: Automatic and manual quality switching
- **Professional Controls**: Netflix-style player controls and UI
- **Keyboard Shortcuts**: Standard media player shortcuts (Space, Arrow keys, etc.)
- **Responsive Design**: Adapts to different screen sizes
- **Plugin Architecture**: Extensible with additional features

### Streaming Capabilities
- **Adaptive Bitrate**: Automatically adjusts quality based on bandwidth
- **Multiple Resolutions**: 720p, 540p, 360p with smooth switching
- **Buffer Management**: Intelligent buffering for smooth playback
- **Cross-Platform**: Works on desktop, mobile, and tablets

## Function Details

### Step 1: Presigned URL Generator
- **Purpose**: Creates secure, time-limited URLs for direct S3 uploads
- **Trigger**: API Gateway POST request
- **Input**: File name and metadata
- **Output**: Presigned S3 upload URL

### Step 2: Media Converter & Thumbnail Generator
- **Purpose**: Converts videos to HLS format and generates thumbnails
- **Trigger**: S3 upload event
- **Operations**:
  - Creates MediaConvert job for HLS output
  - Generates multiple quality variants (720p, 540p, 360p)
  - Creates video thumbnails at specific intervals
  - Optimizes for Video.js player compatibility

### Step 3: MediaPackage Integration
- **Purpose**: Sets up streaming infrastructure compatible with Video.js
- **Operations**:
  - Creates MediaPackage channels with HLS packaging
  - Configures CDN endpoints for global distribution
  - Sets up CORS headers for web player access

### Step 4: Video List Manager & Thumbnail Handler
- **Purpose**: Manages video metadata including thumbnails and player URLs
- **Operations**:
  - Stores/retrieves video information optimized for Video.js
  - Manages thumbnail URLs for preview images
  - Provides video listings with player-compatible URLs

## Video.js Player Configuration

```javascript
const player = videojs('player-id', {
  fluid: true,
  responsive: true,
  aspectRatio: '16:9',
  playbackRates: [0.5, 1, 1.25, 1.5, 2],
  plugins: {
    httpSourceSelector: {
      default: 'auto'
    }
  },
  html5: {
    vhs: {
      enableLowInitialPlaylist: true,
      smoothQualityChange: true,
      overrideNative: true
    }
  }
});
```

## HLS Streaming Format

Videos are processed into HLS format with the following structure:
