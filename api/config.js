// Vercel Serverless Function - API Configuration
// This file provides secure access to API keys without exposing them in the frontend

export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Return configuration from environment variables
  // In local development, these will be null/undefined
  // In production (Vercel), these are set as environment variables
  const config = {
    pexelsApiKey: process.env.PEXELS_API_KEY || null,
    formspreeEndpoint: process.env.FORMSPREE_ENDPOINT || null,
  };

  res.status(200).json(config);
}
