# Frontend: tumor segmentation viewer (HTML, CSS, JS)

No build step.
1. Start the backend (`python app.py` in the backend folder).
2. Serve this folder: `python -m http.server 8080`, then open http://localhost:8080
   (opening index.html directly also works).
3. If the backend is not at http://localhost:5000, edit `config.js`.

Features: drag-and-drop upload, sensitivity cut-off, Original / Overlay / Mask-only views, mask opacity slider, tumor-area stats, downloadable overlay, saved history with delete.

Deployed: host this folder on any static host and set the Render address in `config.js`. See backend/DEPLOY.md.
