#!/bin/bash
cd ~/MathScript-Local
uvicorn backend.main:app --reload > backend.log 2>&1 &
cd ~/MathScript-Local/frontend
npm run dev > frontend.log 2>&1 &
wait
