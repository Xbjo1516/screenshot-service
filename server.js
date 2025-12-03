// server.js
const express = require('express');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// เลื่อนลงล่างสุดของหน้า
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 800;
      const timer = setInterval(() => {
        const scrollHeight =
          document.body.scrollHeight || document.documentElement.scrollHeight;

        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

// เลื่อนกลับขึ้นมาบนสุด (ให้เหมือนผู้ใช้เลื่อนกลับขึ้น)
async function scrollBackToTop(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const distance = 800;
      const timer = setInterval(() => {
        const y = window.scrollY || document.documentElement.scrollTop;
        if (y <= 0) {
          clearInterval(timer);
          resolve();
          return;
        }
        window.scrollBy(0, -distance);
      }, 200);
    });
  });
}

// รอให้รูปโหลดครบ
async function waitForImages(page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);

    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return;
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      })
    );
  });
}

app.post('/screenshot', async (req, res) => {
  const { url, viewport, fullPage } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage({
      viewport: viewport || { width: 1280, height: 720 },
    });

    // 1) เปิดหน้า
    await page.goto(url, { waitUntil: 'networkidle' });

    // 2) เลื่อนลงล่างสุด ให้ trigger lazy-load / scroll event ต่าง ๆ
    await autoScroll(page);

    // 3) รอให้รูปโหลดครบ
    await waitForImages(page);

    // 4) รอเผื่อ animation/lazy-loading อีกนิด
    await page.waitForTimeout(1500);

    // 5) เลื่อนกลับขึ้นบนสุด เพื่อให้ navbar อยู่ด้านบนแบบ state หลังเลื่อนแล้ว
    await scrollBackToTop(page);

    // 6) รอ scroll event / animation navbar ให้เสร็จ
    await page.waitForTimeout(1000);

    // 7) แคปหน้าจอ
    const buffer = await page.screenshot({
      fullPage: fullPage !== false, // default true
      type: 'png',
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    console.error('Screenshot error:', err);
    return res.status(500).json({ error: 'Screenshot failed', detail: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Playwright backend listening on http://localhost:${PORT}`);
});
