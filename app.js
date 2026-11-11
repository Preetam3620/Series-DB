require('dotenv').config();
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const { Passport } = require('passport');
const localModule = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const seriesSchema = new mongoose.Schema({ Title: String, Year: String, imdbRating: String, totalSeasons: String, Genre: String });
const moviesSchema = new mongoose.Schema({ Title: String, Year: String, Director: String, imdbRating: String, Genre: String, Runtime: String });
const userSchema = new mongoose.Schema({ username: String, googleId: String, secret: String, series: [seriesSchema], movies: [moviesSchema] });
userSchema.plugin(localModule.default || localModule);
const User = mongoose.model('User', userSchema);

function createApp({ userModel = User, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is required');
  const app = express();
  const passport = new Passport();
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: env.SESSION_SECRET, resave: false, saveUninitialized: false }));
  app.use(passport.initialize());
  app.use(passport.session());
  passport.use(userModel.createStrategy());
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => { userModel.findById(id).then(user => done(null, user), done); });
  if (env.CLIENT_ID && env.CLIENT_SECRET) {
    passport.use(new GoogleStrategy({ clientID: env.CLIENT_ID, clientSecret: env.CLIENT_SECRET, state: true,
      callbackURL: env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/secrets'
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await userModel.findOne({ googleId: profile.id });
        if (!user) user = await userModel.create({ googleId: profile.id, username: profile.displayName });
        done(null, user);
      } catch (error) { done(error); }
    }));
    app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
    app.get('/auth/google/secrets', passport.authenticate('google', { failureRedirect: '/login', successRedirect: '/lists' }));
  } else {
    app.get(['/auth/google', '/auth/google/secrets'], (req, res) => res.status(503).send('Google sign-in is not configured.'));
  }
  app.get('/', (req, res) => res.render('home'));
  app.get('/login', (req, res) => res.render('login'));
  app.get('/register', (req, res) => res.render('register'));
  app.get('/logout', (req, res, next) => { req.logout(error => error ? next(error) : res.redirect('/')); });
  app.get('/lists', async (req, res) => { res.render('list', { allUsers: await userModel.find({}) }); });
  app.get('/lists/:userId', async (req, res) => {
    if (!mongoose.isObjectIdOrHexString(req.params.userId)) return res.sendStatus(404);
    const user = await userModel.findById(req.params.userId);
    if (!user) return res.sendStatus(404);
    res.render('table', { userName: user.username, seriesArray: user.series, moviesArray: user.movies });
  });
  const requireLogin = (req, res, next) => req.isAuthenticated() ? next() : res.redirect('/login');
  app.get('/submit', requireLogin, (req, res) => res.render('submit', { seriesArray: req.user.series, moviesArray: req.user.movies }));
  app.post('/register', async (req, res, next) => {
    try { await userModel.register({ username: req.body.username }, req.body.password); }
    catch (error) {
      if (error instanceof localModule.errors.AuthenticationError) return res.redirect('/register');
      throw error;
    }
    passport.authenticate('local', { successRedirect: '/submit', failureRedirect: '/register' })(req, res, next);
  });
  app.post('/login', passport.authenticate('local', { successRedirect: '/lists', failureRedirect: '/login' }));
  for (const [route, field, type, collection] of [
    ['tv_series', 'series_name', 'series', 'series'], ['movie', 'movie_name', 'movie', 'movies']
  ]) {
    app.post(`/submit/${route}`, requireLogin, async (req, res) => {
      const title = req.body[field];
      if (typeof title !== 'string' || !title.trim()) return res.redirect('/submit');
      const url = new URL('https://www.omdbapi.com/');
      url.search = new URLSearchParams({ t: title.trim(), apikey: env.OMDB_API_KEY || '' }).toString();
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return res.status(502).send('Movie lookup failed. Please try again.');
      const body = await response.json();
      if (body.Response === 'True' && body.Type === type) {
        await userModel.updateOne({ _id: req.user._id }, { $push: { [collection]: body } }, { runValidators: true });
      }
      res.redirect('/submit');
    });
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error(error);
    res.status(error.status || 500).send('Unable to complete the request.');
  });
  return app;
}
async function start() {
  const app = createApp();
  const uri = process.env.MONGODB_URI || (process.env.MONGO_USER && process.env.MONGO_PWD
    ? `mongodb+srv://${encodeURIComponent(process.env.MONGO_USER)}:${encodeURIComponent(process.env.MONGO_PWD)}@cluster0-bq71x.mongodb.net/seriesDB`
    : 'mongodb://127.0.0.1:27017/seriesDB');
  await mongoose.connect(uri);
  return app.listen(process.env.PORT || 3000, () => console.log('Server has started successfully.'));
}
if (require.main === module) start().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createApp, start, User };
