const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Allow requests from your React frontend

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.get("/api/trending-skills", async (req, res) => {
  res.setTimeout(120000);

  const { career } = req.query;

  if (!career) {
    return res
      .status(400)
      .json({ error: "Career query parameter is required" });
  }

  console.log(`Fetching jobs for: ${career}`);

  // 1. Fetch Job Postings from JSearch API
  const options = {
    method: "GET",
    url: "https://jsearch.p.rapidapi.com/search",
    params: {
      query: `latest ${career} jobs in USA`,
      num_pages: "1", // Fetching roughly 10-15 results
    },
    headers: {
      "X-RapidAPI-Key": process.env.JSEARCH_API_KEY,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  };

  try {
    const response = await axios.request(options);
    const jobs = response.data.data;

    if (!jobs || jobs.length === 0) {
      return res.status(404).json({ error: "No jobs found for this career." });
    }

    // 2. Aggregate Job Descriptions for Analysis
    const descriptions = jobs
      .map((job) => job.job_description)
      .join("\n\n---\n\n");

    console.log(
      `Sending ${jobs.length} job descriptions to Gemini for analysis...`
    );

    // 3. Analyze with Gemini API
    const prompt = `
      You are an expert job market analyst. Based *only* on the following job descriptions, identify the top 5-10 most frequently mentioned technical skills and provide an estimated salary range.
      Do not invent skills or salaries not present in the text.
      The output must be a clean JSON object with no extra text or markdown.
      
      The JSON object should have this exact structure:
      {
        "trending_skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"],
        "salary_range": "e.g., $110,000 - $150,000"
      }
    `;

    const result = await model.generateContent([prompt, descriptions]);
    const geminiResponseText = await result.response.text();

    // Clean the response to ensure it's valid JSON
    const cleanedJsonString = geminiResponseText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    console.log("Gemini analysis complete. Sending data to frontend.");

    // Parse and send the final data
    const analyzedData = JSON.parse(cleanedJsonString);
    res.json(analyzedData);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Failed to fetch or analyze job data." });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
