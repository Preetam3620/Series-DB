require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const request = require("request");
const _ = require("lodash");
const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

/* express session settings */
app.use(
	session({
		secret: "A secret.",
		resave: false,
		saveUninitialized: false,
	})
);

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(
	"mongodb+srv://" +
		process.env.MONGO_USER +
		":" +
		process.env.MONGO_PWD +
		"@cluster0-bq71x.mongodb.net/seriesDB",
	{ useNewUrlParser: true, useUnifiedTopology: true }
);
// mongoose.connect("mongodb://localhost:27017/userDB", { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set("useCreateIndex", true);

/* mongoose model */
const seriesSchema = new mongoose.Schema({
	Title: String,
	Year: String,
	imdbRating: String,
	totalSeasons: String,
	Genre: String,
});

const moviesSchema = new mongoose.Schema({
	Title: String,
	Year: String,
	Director: String,
	imdbRating: String,
	Genre: String,
	Runtime: String,
});

const userSchema = new mongoose.Schema({
	username: String,
	password: String,
	secret: String,
	googleId: String,
	series: [seriesSchema],
	movies: [moviesSchema],
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
	done(null, user.id);
});

passport.deserializeUser(function (id, done) {
	User.findById(id, function (err, user) {
		done(err, user);
	});
});

passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.CLIENT_ID,
			clientSecret: process.env.CLIENT_SECRET,
			callbackURL: "https://movies-series-lists.herokuapp.com/auth/google/secrets",
			// callbackURL: "http://localhost:3000/auth/google/secrets",
			userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
		},
		function (accessToken, refreshToken, profile, cb) {
			User.findOrCreate(
				{ googleId: profile.id, username: profile.displayName },
				(err, user) => cb(null, user)
			);
		}
	)
);

/* get routes */
app.get("/", function (req, res) {
	res.render("home");
});

app.get("/auth/google", passport.authenticate("google", { scope: ["profile"] }));

app.get(
	"/auth/google/secrets",
	passport.authenticate("google", { failureRedirect: "/login" }),
	function (req, res) {
		// Successful authentication, redirect home.
		res.redirect("/lists");
	}
);

app.get("/login", function (req, res) {
	res.render("login");
});

app.get("/register", function (req, res) {
	res.render("register");
});

app.get("/logout", function (req, res) {
	req.logOut();
	res.redirect("/");
});

app.get("/lists", function (req, res) {
	User.find({}, (err, users) => {
		res.render("list", { allUsers: users });
	});
});

app.get("/lists/:userId", (req, res) => {
	const requestedId = req.params.userId;

	User.findOne({ _id: requestedId }, (err, foundUser) => {
		res.render("table", {
			userName: foundUser.username,
			seriesArray: foundUser.series,
			moviesArray: foundUser.movies,
		});
	});
});

app.get("/submit", function (req, res) {
	if (req.isAuthenticated()) {
		res.render("submit", { seriesArray: req.user.series, moviesArray: req.user.movies });
	} else {
		res.redirect("/login");
	}
});

/* post routes */
app.post("/register", function (req, res) {
	User.register({ username: req.body.username }, req.body.password, function (err, user) {
		if (err) {
			console.log(err);
			res.redirect("/register");
		} else {
			passport.authenticate("local")(req, res, function () {
				res.redirect("/submit");
			});
		}
	});
});

app.post("/login", function (req, res) {
	const user = new User({
		username: req.body.username,
		password: req.body.password,
	});
	req.login(user, function (err) {
		if (err) {
			console.log(err);
		} else {
			passport.authenticate("local")(req, res, function () {
				res.redirect("/lists");
			});
		}
	});
});

app.post("/submit/tv_series", (req, res) => {
	const url =
		"http://www.omdbapi.com/?t=" + req.body.series_name + "&apikey=" + process.env.OMDB_API_KEY;
	let options = { json: true };

	request(url, options, (error, result, body) => {
		if (error) {
			return console.log(error);
		}
		if (!error && result.statusCode == 200) {
			if (body.Response === "True" && body.Type === "series") {
				User.findById(req.user._id, function (err, foundUser) {
					if (err) {
						console.log(err);
						res.redirect("/submit");
					} else {
						if (foundUser) {
							foundUser.series.push(body);
							foundUser.save(function () {
								res.redirect("/submit");
							});
						}
					}
				});
			} else {
				res.redirect("/submit");
			}
		}
	});
});

app.post("/submit/movie", (req, res) => {
	const url =
		"http://www.omdbapi.com/?t=" + req.body.movie_name + "&apikey=" + process.env.OMDB_API_KEY;
	let options = { json: true };

	request(url, options, (error, result, body) => {
		if (error) {
			return console.log(error);
		}
		if (!error && result.statusCode == 200) {
			if (body.Response === "True" && body.Type === "movie") {
				User.findById(req.user._id, function (err, foundUser) {
					if (err) {
						console.log(err);
						res.redirect("/submit");
					} else {
						if (foundUser) {
							foundUser.movies.push(body);
							foundUser.save(function () {
								res.redirect("/submit");
							});
						}
					}
				});
			} else {
				res.redirect("/submit");
			}
		}
	});
});

app.listen(process.env.PORT || 3000, function () {
	console.log("___Server has started sucessfully.");
});
