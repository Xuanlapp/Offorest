#!/bin/bash

# Offorest API Testing Script
# Usage: ./test_upload.sh <image_file> <keyword> <wp_token> <google_token> [gid]

if [ $# -lt 4 ]; then
    echo "Usage: $0 <image_file> <keyword> <wp_token> <google_token> [gid]"
    echo "Example: $0 image.jpg 'test upload' 'jwt_token_here' 'google_token_here' '999897633'"
    exit 1
fi

IMAGE_FILE=$1
KEYWORD=$2
WP_TOKEN=$3
GOOGLE_TOKEN=$4
GID=${5:-999897633}  # Default gid if not provided
SHEET_ID="1YIDqRTN1RcKecmpc8fbnYdZrBee3CqqjfrlQ_yjOpFQ"

echo "Testing Offorest API Upload..."
echo "Image: $IMAGE_FILE"
echo "Keyword: $KEYWORD"
echo "Sheet ID: $SHEET_ID"
echo "GID: $GID"
echo ""

# Test connection first
echo "1. Testing backend connection..."
curl -X GET "http://offorest-wp.lap/wp-json/offorest-api/v1/test-connection" \
  -H "Authorization: Bearer $WP_TOKEN" \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "2. Uploading image..."

# Upload image
curl -X POST "http://offorest-wp.lap/wp-json/offorest-api/v1/google/upload" \
  -H "Authorization: Bearer $WP_TOKEN" \
  -F "file_0=@$IMAGE_FILE" \
  -F "keyword=$KEYWORD" \
  -F "sheetId=$SHEET_ID" \
  -F "gid=$GID" \
  -F "accessToken=$GOOGLE_TOKEN" \
  -w "\nStatus: %{http_code}\n"

echo ""
echo "Upload test completed!"