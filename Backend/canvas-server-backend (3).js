const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Proxy endpoint for Canvas API
app.post('/api/canvas-proxy', async (req, res) => {
  const { canvasUrl, apiToken, endpoint } = req.body;

  if (!canvasUrl || !apiToken || !endpoint) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const url = `${canvasUrl}${endpoint}`;
    console.log(`Fetching: ${url}`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `Canvas API error: ${response.status}`,
        details: errorText,
      });
    }

    const data = await response.json();
    
    // Filter for starred courses if this is a courses endpoint
    if (endpoint.includes('/api/v1/courses') && !endpoint.includes('/assignments') && !endpoint.includes('/courses/')) {
      console.log(`Total courses returned: ${data.length}`);
      console.log('Sample course data:', data[0]);
      const filteredCourses = data.filter(course => course.is_favorite === true);
      console.log(`Filtered to ${filteredCourses.length} starred courses`);
      if (filteredCourses.length === 0) {
        console.log('WARNING: No starred courses found. Showing all courses instead.');
        res.json(data); // Fallback to showing all courses
      } else {
        res.json(filteredCourses);
      }
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Canvas Gantt server running on http://localhost:${PORT}`);
  console.log('Open http://localhost:3000 in your browser');
});
