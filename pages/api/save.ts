import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';
import playlistIds from '../../spotifyConfig';

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN,
  API_TOKEN_SECRET,
} = process.env;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // handle bad stuff
  if (
    SPOTIFY_CLIENT_ID === undefined ||
    SPOTIFY_CLIENT_SECRET === undefined ||
    SPOTIFY_REFRESH_TOKEN === undefined ||
    API_TOKEN_SECRET === undefined
  ) {
    return res.status(500).json({ statusCode: 500 });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end({ statusCode: 405 });
  }

  if (req.headers.authorization?.split(' ')[1] !== API_TOKEN_SECRET) {
    return res.status(401).json({ statusCode: 401 });
  }

  // get an access token
  const {
    data: { access_token: accessToken },
  } = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
    {
      auth: {
        username: SPOTIFY_CLIENT_ID,
        password: SPOTIFY_CLIENT_SECRET,
      },
    }
  );

  // running this in parallel causes the spotify api to return 503s... sucks to be them...
  for (const playlistId of playlistIds) {
    // get the tracks in the playlist
    const {
      data: { tracks, name: playlistName },
    } = await axios.get<SpotifyApi.SinglePlaylistResponse>(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const trackURIs = tracks.items.map((item) => item.track?.uri);

    // create a new playlist
    const today = new Date();
    const todayString = `${today.getDate()}/${
      today.getMonth() + 1
    }/${today.getFullYear()}`;
    const newPlaylistName = `${playlistName} ${todayString}`;
    const {
      data: { id: newPlaylistId },
    } = await axios.post<SpotifyApi.CreatePlaylistResponse>(
      'https://api.spotify.com/v1/me/playlists',
      {
        name: newPlaylistName,
        public: false,
        description: `Your ${playlistName} from ${todayString}`,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // add the tracks to the new playlist
    await axios.post<SpotifyApi.AddTracksToPlaylistResponse>(
      `https://api.spotify.com/v1/playlists/${newPlaylistId}/tracks`,
      {
        uris: trackURIs,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
  }

  res.status(200).json({ playlistsCreated: playlistIds.length });
}
