const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

app.use(cors());
app.use(express.static('public'));

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

app.get('/api/playlist/:playlistId', async (req, res) => {
  const { playlistId } = req.params;
  if (!playlistId) {
    return res.status(400).json({ error: 'Playlist ID is required' });
  }

  try {
    // 1단계: 재생목록의 기본 정보(제목) 가져오기
    const playlistResponse = await youtube.playlists.list({
        // ❗ part: 배열이 아닌 단일 문자열로 수정
        part: 'snippet',
        id: playlistId,
    });

    if (playlistResponse.data.items.length === 0) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }
    const playlistTitle = playlistResponse.data.items[0].snippet.title;

    // 2단계: 재생목록의 모든 동영상 ID 가져오기 (페이지네이션 처리)
    let videoIds = [];
    let nextPageToken = null;
    do {
      const playlistItemsResponse = await youtube.playlistItems.list({
        part: 'snippet',
        playlistId: playlistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });
      playlistItemsResponse.data.items.forEach(item => {
        // 비공개 동영상 등 ID가 없는 경우를 방지
        if (item.snippet?.resourceId?.videoId) {
            videoIds.push(item.snippet.resourceId.videoId);
        }
      });
      nextPageToken = playlistItemsResponse.data.nextPageToken;
    } while (nextPageToken);

    if (videoIds.length === 0) {
        return res.json({ playlistTitle, totalCount: 0, videos: [] });
    }

    // 3단계: 모든 동영상 ID를 50개씩 나누어 상세 정보 요청
    let allVideoDetails = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const videoIdChunk = videoIds.slice(i, i + 50);

      const videoDetailsResponse = await youtube.videos.list({
        part: 'snippet,contentDetails',
        id: videoIdChunk.join(','), // 쉼표로 구분된 문자열로 전달
      });
      
      allVideoDetails = allVideoDetails.concat(videoDetailsResponse.data.items);
    }
    
    // 4단계: 프론트엔드로 보낼 최종 데이터 가공
    const videos = allVideoDetails.map(item => ({
      id: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url,
      publishedAt: item.snippet.publishedAt,
      duration: item.contentDetails.duration,
    }));
    
    // 원본 재생목록 순서대로 정렬
    const sortedVideos = videoIds.map(id => videos.find(video => video.id === id)).filter(Boolean);

    res.json({
      playlistTitle,
      totalCount: videoIds.length,
      videos: sortedVideos,
    });

  } catch (error) {
    console.error('Error fetching YouTube data:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from YouTube API.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});