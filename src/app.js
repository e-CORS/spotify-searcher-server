const express = require("express");
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const app = express();
const port = process.env.PORT;
const prisma = new PrismaClient();

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

let accessToken = "";
let headers = {};

const baseSpotifyArtistUrl = "https://api.spotify.com/v1/search?q= artist:";
const baseSpotifyAristsAlbumsUrl = "https://api.spotify.com/v1/artists/";
const baseSpotifyAlbumUrl = "https://api.spotify.com/v1/albums";

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  // You can configure other CORS headers as needed
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  // You can allow specific HTTP methods
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  express.json();
  next();
});

app.get("/", async (req, res) => {
  res.json("Hello! I'm running on port " + port);
});

const spotifySearchHelper = async (url) => {
  return await axios
    .get(url, {
      headers,
    })
    .then((res) => {
      return res.data;
    })
    .catch((error) => {
      throw new Error(error);
    });
};

const getAccessTokenFromSpotify = async () => {
  const data = `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`;
  return await axios
    .post("https://accounts.spotify.com/api/token", data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    })
    .then((response) => {
      accessToken = response.data.access_token;
      headers = { Authorization: `Bearer ${accessToken}` };
      return response;
    })
    .catch((error) => {
      throw Error(error);
    });
};

const saveSearchLog = async (endpointUrl, searchContent) => {
  const saveSearchLog = await prisma.searches.create({
    data: {
      searchEndpoint: endpointUrl,
      content: searchContent,
    },
  });
  console.log(saveSearchLog);
};
app.get("/arists-albums/", async (req, res) => {
  try {
    const artist = req.query?.artist;
    if (!artist) throw new Error("No artist found");

    await getAccessTokenFromSpotify();
    const responseArtists = await spotifySearchHelper(
      encodeURI(`${baseSpotifyArtistUrl} ${artist}&type=artist`)
    );
    if (!responseArtists || !responseArtists.artists?.items?.length > 0) {
      return res.json([]);
    }
    const artists = responseArtists.artists;
    const artistId = artists.items[0].id;
    const albumsOfArtist = await spotifySearchHelper(
      `${baseSpotifyAristsAlbumsUrl}${artistId}/albums`
    );
    if (!albumsOfArtist || !albumsOfArtist?.items.length > 0) {
      return res.json([]);
    }
    const albumsIdsArr = albumsOfArtist.items.map((album) => album.id);
    const albumsIds = String(albumsIdsArr);
    const albumsWithInfo = await spotifySearchHelper(
      `${baseSpotifyAlbumUrl}?ids=${albumsIds}`
    );
    const albumsOfArtistSorted = albumsWithInfo.albums.sort((a, b) => {
      return b.popularity - a.popularity;
    });
    await saveSearchLog("/arists-albums/", artist)
      .then(async () => {
        await prisma.$disconnect();
      })
      .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
      });
    res.json(albumsOfArtistSorted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred" });
  }
});

app.get("/albums-songs/", async (req, res) => {
  try {
    const albumId = req.query?.albumId;
    if (!albumId) throw new Error("No Album id found");

    await getAccessTokenFromSpotify();

    const responseTracks = await spotifySearchHelper(
      `${baseSpotifyAlbumUrl}/${albumId}/tracks`
    );
    if (!responseTracks || !responseTracks.items?.length > 0) {
      return res.json([]);
    }
    await saveSearchLog("/albums-songs/", albumId)
      .then(async () => {
        await prisma.$disconnect();
      })
      .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
      });
    res.json(responseTracks.items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred" });
  }
});
app.listen(port, () => {
  console.log(`Server started and is running on port ${port}`);
});
