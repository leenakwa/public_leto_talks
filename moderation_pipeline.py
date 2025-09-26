"""
Moderation pipeline (TF-IDF LogisticRegression)

Usage:
  1) Install dependencies:
     pip install pandas scikit-learn joblib fastapi uvicorn

  2) To train on labeled CSV (columns: text,label) and save model:
     python moderation_pipeline.py --train comments_labeled.csv

  3) To run as a microservice:
     python moderation_pipeline.py --serve

Outputs:
  - models/toxic_pipe.joblib  (trained sklearn pipeline)
  - logs/moderation_log.csv  (all moderation events)
  - logs/to_label.csv        (examples that should be human-labeled)

This script implements:
  - TF-IDF + LogisticRegression classifier
  - simple text normalization (leet -> letters, remove punctuation)
  - moderation logic based on model probability with thresholds to block/flag/allow
  - logging of borderline cases for later human labeling and retraining
"""

import argparse
import os
import re
import csv
from datetime import datetime
from typing import Optional, Dict, Any

import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
import joblib

# ---------------------------
# Config
# ---------------------------
MODEL_DIR = "models"
LOG_DIR = "logs"
MODEL_PATH = os.path.join(MODEL_DIR, "toxic_pipe.joblib")
MODERATION_LOG = os.path.join(LOG_DIR, "moderation_log.csv")
TO_LABEL_CSV = os.path.join(LOG_DIR, "to_label.csv")

# thresholds (tweak as you like)
THRESH_BLOCK = 0.8   # model probability >= block
THRESH_FLAG = 0.5    # model prob >= flag
TO_LABEL_MIN = 0.45   # anything with prob >= TO_LABEL_MIN & < THRESH_BLOCK -> add to to_label

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# ---------------------------
# Text normalization (leet -> letters, remove punctuation)
# ---------------------------
LEET_MAP = str.maketrans({
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
    '@': 'a', '$': 's'
})

def simple_normalize(text: str) -> str:
    """
    Normalize text for model:
      - lowercasing
      - replace common leet characters with letters
      - remove non-alphanumeric (keep Cyrillic/Latin and digits/spaces)
      - collapse multiple spaces
    """
    if text is None:
        return ""
    t = str(text).lower()
    t = t.translate(LEET_MAP)
    # replace any char that's not cyrillic/latin/digit/space with space
    t = re.sub(r'[^0-9a-zа-яё\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

# ---------------------------
# ML: train/load pipeline
# ---------------------------
def train_model(csv_path: str, text_col: str = 'text', label_col: str = 'label', save_path: str = MODEL_PATH) -> Dict[str, Any]:
    """
    Train TF-IDF + LogisticRegression on labeled CSV and save model.
    CSV must contain columns: text,label
    """
    df = pd.read_csv(csv_path)
    df = df[[text_col, label_col]].dropna()
    # normalize texts BEFORE vectorization
    X_raw = df[text_col].astype(str).values
    X = np.array([simple_normalize(t) for t in X_raw])
    y = df[label_col].astype(int).values

    # robust stratify option (avoid error if a class has <2 samples)
    stratify_opt = y if (len(np.unique(y)) > 1 and np.min(np.bincount(y)) >= 2) else None

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=stratify_opt
    )

    vectorizer = TfidfVectorizer(analyzer='word', ngram_range=(1,2), max_features=50000)
    clf = LogisticRegression(max_iter=1000, class_weight='balanced')
    pipe = Pipeline([('tfidf', vectorizer), ('clf', clf)])

    print("Training...")
    pipe.fit(X_train, y_train)

    preds = pipe.predict(X_test)
    probs = pipe.predict_proba(X_test)[:, 1] if hasattr(pipe, 'predict_proba') else None

    report = classification_report(y_test, preds, output_dict=True)
    roc = float(roc_auc_score(y_test, probs)) if probs is not None else None

    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    joblib.dump(pipe, save_path)
    print(f"Saved model to {save_path}")

    return {"report": report, "roc_auc": roc}

def load_model(path: str = MODEL_PATH):
    if os.path.exists(path):
        return joblib.load(path)
    else:
        return None

# ---------------------------
# Moderation logic
# ---------------------------
def moderate_comment(text: str, model: Optional[Pipeline]=None, meta: Optional[Dict]=None) -> Dict[str, Any]:
    """Moderate a single comment. Returns dict with action and scores.

    Actions: 'block' (auto-block), 'flag' (send to manual moderation), 'allow'
    """
    if meta is None:
        meta = {}
    tstamp = datetime.utcnow().isoformat()

    model_prob = None

    if model is not None:
        norm_text = simple_normalize(text)
        model_prob = float(model.predict_proba([norm_text])[0][1])
        if model_prob >= THRESH_BLOCK:
            action = 'block'
            reason = 'model:high_confidence'
        elif model_prob >= THRESH_FLAG:
            action = 'flag'
            reason = 'model:medium_confidence'
        else:
            action = 'allow'
            reason = 'model:low_confidence'
    else:
        action = 'flag'
        reason = 'no_model'

    out = {
        'timestamp': tstamp,
        'text': text,
        'model_prob': model_prob,
        'action': action,
        'reason': reason
    }

    _append_log(out, meta)

    if model_prob is not None and TO_LABEL_MIN <= model_prob < THRESH_BLOCK:
        _append_to_label(out, meta)

    return out

# ---------------------------
# Logging helpers
# ---------------------------
def _append_log(entry: Dict[str, Any], meta: Dict[str, Any]):
    header = ['timestamp','text','model_prob','action','reason','meta']
    row = [entry['timestamp'], entry['text'], entry['model_prob'], entry['action'], entry['reason'], str(meta)]
    write_header = not os.path.exists(MODERATION_LOG)
    with open(MODERATION_LOG, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(header)
        writer.writerow(row)

def _append_to_label(entry: Dict[str, Any], meta: Dict[str, Any]):
    header = ['timestamp','text','model_prob','meta','label']
    row = [entry['timestamp'], entry['text'], entry['model_prob'], str(meta), '']
    write_header = not os.path.exists(TO_LABEL_CSV)
    with open(TO_LABEL_CSV, 'a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(header)
        writer.writerow(row)

# ---------------------------
# Minimal FastAPI app for serving moderation endpoint
# ---------------------------
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
app = FastAPI(title='Moderation API')

class CommentIn(BaseModel):
    text: str
    user_id: Optional[str] = None
    comment_id: Optional[str] = None

@app.on_event('startup')
def startup_event():
    global MODEL
    MODEL = load_model()  # attempt to load model at startup

@app.post('/moderate')
def api_moderate(payload: CommentIn):
    try:
        meta = {'user_id': payload.user_id, 'comment_id': payload.comment_id}
        out = moderate_comment(payload.text, model=MODEL, meta=meta)
        return out
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------
# CLI
# ---------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--train', help='Train model using labeled CSV (columns: text,label)')
    parser.add_argument('--serve', action='store_true', help='Run FastAPI server (uvicorn required)')
    parser.add_argument('--test', action='store_true', help='Run quick local tests')
    args = parser.parse_args()

    if args.train:
        res = train_model(args.train)
        print('Training results:')
        print(res)
    elif args.serve:
        print('Starting server: uvicorn moderation_pipeline:app --reload')
        print('If uvicorn not installed: pip install uvicorn')
    elif args.test:
        model = load_model()
        if model is None:
            print("No model found. Train first with --train.")
            return
        df = pd.read_csv("comments_unlabeled.csv") if os.path.exists("comments_unlabeled.csv") else None
        if df is not None and 'text' in df.columns:
            sample_comments = df['text'].astype(str).head(20)
            for s in sample_comments:
                print(moderate_comment(s, model=model))
        else:
            print("No comments_unlabeled.csv found or missing 'text' column.")
    else:
        parser.print_help()


main()
