// Simple API server for local development
// This mimics Vercel's serverless function behavior locally

const http = require('http');
const url = require('url');

const PORT = 3001;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle GET /api/config
  if (req.method === 'GET' && parsedUrl.pathname === '/api/config') {
    const config = {
      pexelsApiKey: process.env.PEXELS_API_KEY || null,
      formspreeEndpoint: process.env.FORMSPREE_ENDPOINT || null,
    };

    res.writeHead(200);
    res.end(JSON.stringify(config));
    console.log(`✓ Served config: pexelsApiKey=${config.pexelsApiKey ? 'set' : 'null'}, formspreeEndpoint=${config.formspreeEndpoint ? 'set' : 'null'}`);
    return;
  }

  // 404 for other routes
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/api/config`);
  console.log(`💡 Note: API keys are ${process.env.PEXELS_API_KEY ? 'set' : 'NOT set'} in environment`);
});
