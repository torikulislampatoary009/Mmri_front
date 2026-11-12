// Address of the backend. Localhost is used when you open the page on your own computer;
// replace the Render address below with your deployed service URL.
window.API_BASE = ["localhost", "127.0.0.1", ""].includes(location.hostname)
  ? "http://localhost:5000"
  : "https://mmri-back.onrender.com";
