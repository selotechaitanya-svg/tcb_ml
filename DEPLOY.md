# Deployment Guide: Streamlit Community Cloud

Deploy the Spider-Man Incident Priority Predictor for free on [Streamlit Community Cloud](https://streamlit.io/cloud).

## Prerequisites

1. A GitHub account
2. A public GitHub repository with this project pushed to it

## Step-by-Step Deployment

### 1. Push to GitHub

```bash
cd spiderman-incident-priority
git init
git add .
git commit -m "Initial commit: Spider-Man Incident Priority Classifier"
git remote add origin https://github.com/YOUR_USERNAME/spiderman-incident-priority.git
git push -u origin main
```

> **Note**: Make sure `models/best_model.joblib` is committed (it's ~small enough for GitHub). If it's large, consider [Git LFS](https://git-lfs.github.com/).

### 2. Sign in to Streamlit Community Cloud

1. Go to [share.streamlit.io](https://share.streamlit.io)
2. Sign in with your GitHub account
3. Click **"New app"**

### 3. Configure the App

| Setting | Value |
|---------|-------|
| **Repository** | `YOUR_USERNAME/spiderman-incident-priority` |
| **Branch** | `main` |
| **Main file path** | `app/app.py` |

### 4. Deploy

1. Click **"Deploy!"**
2. Wait for the build to complete (~2–3 minutes)
3. Your app is live at `https://YOUR_APP_NAME.streamlit.app`

## Requirements

The `requirements.txt` at the repo root is automatically detected by Streamlit Cloud. It installs all dependencies including scikit-learn and joblib needed to load the model.

## Troubleshooting

- **Model file not found**: Ensure `models/best_model.joblib` and `models/model_metadata.json` are committed to the repo.
- **Import errors**: Check that `src/` modules are present and `requirements.txt` is complete.
- **scikit-learn version mismatch**: The app warns if versions differ. Pin the exact version in `requirements.txt`.
- **Memory limit**: Streamlit Cloud free tier has 1GB RAM. This model is small enough.

## Local Testing

```bash
streamlit run app/app.py --server.headless true
# Visit http://localhost:8501
```
