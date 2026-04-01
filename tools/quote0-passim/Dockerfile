FROM python:3.13-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

RUN useradd -r -s /usr/sbin/nologin appuser
USER appuser

ENV PASSIM_URL="" \
    PASSIM_API_KEY="" \
    QUOTE0_API_KEY="" \
    QUOTE0_DEVICE_ID="" \
    INTERVAL="60" \
    PROXY="" \
    VERIFY_SSL="0" \
    TZ="Asia/Shanghai"

CMD ["python", "-u", "main.py"]
