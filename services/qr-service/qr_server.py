#!/usr/bin/env python3
"""
Simple QR Code generation server for Dela P2P File Sharing
"""

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import qrcode
import io
import os
import base64
from PIL import Image

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

@app.route('/generate_qr', methods=['POST'])
def generate_qr():
    try:
        data = request.get_json()
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        # Create QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(text)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
        
        return jsonify({
            'success': True,
            'image': f'data:image/png;base64,{img_base64}'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'QR Code Generator'})

if __name__ == '__main__':
    # Use 0.0.0.0 to listen on all available network interfaces
    # Use the PORT environment variable provided by Render, default to 5000
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting QR Code generation server on port {port}...")
    app.run(host='0.0.0.0', port=port)