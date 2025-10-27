const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = 3000;

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

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

// PDF upload and parsing endpoint
app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const courseName = req.body.courseName || 'Uploaded Syllabus';
    
    console.log(`Parsing PDF: ${req.file.originalname}`);
    
    // Parse PDF
    const pdfData = await pdfParse(req.file.buffer);
    const text = pdfData.text;
    
    console.log(`Extracted ${text.length} characters from PDF`);
    
    // Extract assignments using similar patterns as HTML syllabi
    const assignments = [];
    const lines = text.split('\n');
    
    const datePatterns = [
      /(?:due|submit|deadline|assignment).*?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}).*?(?:due|submit|deadline|assignment)/gi,
      /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?)/gi,
      /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?)/gi,
      /(?:due|submit|deadline).*?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})/gi
    ];
    
    lines.forEach((line, idx) => {
      datePatterns.forEach(pattern => {
        const matches = [...line.matchAll(pattern)];
        matches.forEach(match => {
          try {
            const dateStr = match[1];
            const date = new Date(dateStr);
            
            // Add current year if not specified
            if (dateStr && !dateStr.match(/\d{4}/) && !isNaN(date.getTime())) {
              const currentYear = new Date().getFullYear();
              date.setFullYear(currentYear);
              
              // If date is in the past, try next year
              if (date < new Date()) {
                date.setFullYear(currentYear + 1);
              }
            }
            
            if (!isNaN(date.getTime()) && date > new Date('2020-01-01')) {
              // Extract assignment name from the line
              let name = line.trim();
              name = name.replace(match[0], '').trim();
              name = name.replace(/^[-:•\d.\s]+/, '').trim();
              
              // Clean up common patterns
              name = name.replace(/\s+/g, ' ');
              
              if (name.length > 100) {
                name = name.substring(0, 100) + '...';
              }
              
              if (name && name.length > 3) {
                assignments.push({
                  name: name,
                  courseName: courseName,
                  dueDate: date.toISOString(),
                  source: 'pdf'
                });
              }
            }
          } catch (e) {
            // Skip invalid dates
          }
        });
      });
    });
    
    console.log(`Found ${assignments.length} potential assignments in PDF`);
    
    res.json({ 
      assignments,
      text: text.substring(0, 500) // Send sample text for debugging
    });
    
  } catch (error) {
    console.error('PDF parsing error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Canvas Gantt server running on http://localhost:${PORT}`);
  console.log('Open http://localhost:3000 in your browser');
});