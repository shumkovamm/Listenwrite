export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: 'Missing videoId' });

  try {
    // Step 1: fetch YouTube watch page to get ytInitialPlayerResponse
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const html = await pageRes.text();

    // Step 2: extract caption track list
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});\s*(?:var\s+\w+\s*=|<\/script>)/);
    if (!match) return res.status(404).json({ error: 'Could not parse YouTube page' });

    const playerData = JSON.parse(match[1]);
    const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (captionTracks.length === 0) {
      return res.status(404).json({ error: 'No caption tracks found' });
    }

    // Step 3: build track list with baseUrls
    const tracks = captionTracks.map(t => ({
      lang: t.languageCode,
      asr: t.kind === 'asr',
      name: t.name?.simpleText || t.name?.runs?.[0]?.text || t.languageCode,
      baseUrl: t.baseUrl,
    }));

    // Step 4: if ?lang= provided, fetch that track's XML content
    const { lang, asr } = req.query;
    if (lang) {
      const track = tracks.find(t =>
        t.lang === lang && (asr === undefined || String(t.asr) === asr)
      ) || tracks.find(t => t.lang === lang) || tracks[0];

      if (!track?.baseUrl) {
        return res.status(404).json({ error: 'Track not found' });
      }

      const xmlRes = await fetch(track.baseUrl + '&fmt=srv1', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const xml = await xmlRes.text();
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(xml);
    }

    // Return track list as JSON
    return res.status(200).json({ tracks });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

