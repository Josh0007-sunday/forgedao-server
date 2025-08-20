// const passport = require('passport');
// const GitHubStrategy = require('passport-github2').Strategy;
// const User = require('../models/User');

// passport.use(new GitHubStrategy({
//     clientID: process.env.GITHUB_CLIENT_ID,
//     clientSecret: process.env.GITHUB_CLIENT_SECRET,
//     callbackURL: process.env.GITHUB_CALLBACK_URL || '',
//     scope: ['user:email', 'repo']
//   },
//   async (accessToken, refreshToken, profile, done) => {
//     try {
//       let user = await User.findOne({ githubId: profile.id });
      
//       if (!user) {
//         user = new User({
//           githubId: profile.id,
//           username: profile.username,
//           bio: profile._json.bio || '',
//           accessToken: accessToken
//         });
//       } else {
//         user.accessToken = accessToken;
//       }
      
//       await user.save();
//       return done(null, user);
//     } catch (error) {
//       return done(error);
//     }
//   }
// ));

// passport.serializeUser((user, done) => {
//   done(null, user.id);
// });

// passport.deserializeUser(async (id, done) => {
//   try {
//     const user = await User.findById(id);
//     done(null, user);
//   } catch (error) {
//     done(error);
//   }
// });

// module.exports = passport;


// config/passport.js - Fixed passport configuration
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email', 'repo']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('=== GITHUB STRATEGY CALLBACK ===');
      console.log('Profile ID:', profile.id);
      console.log('Profile username:', profile.username);
      console.log('Profile emails:', profile.emails);
      
      let user = await User.findOne({ githubId: profile.id });
      
      if (!user) {
        console.log('Creating new user...');
        user = new User({
          githubId: profile.id,
          username: profile.username,
          bio: profile._json.bio || '',
          accessToken: accessToken
        });
      } else {
        console.log('Updating existing user...');
        user.accessToken = accessToken;
        // Update username if it changed
        user.username = profile.username;
      }
      
      await user.save();
      console.log('User saved/updated with ID:', user.id);
      console.log('================================');
      
      return done(null, user);
    } catch (error) {
      console.error('Passport strategy error:', error);
      return done(error, null);
    }
  }
));

// Serialization - Store user ID in session
passport.serializeUser((user, done) => {
  console.log('Serializing user ID:', user.id);
  done(null, user.id);
});

// Deserialization - Retrieve user from database
passport.deserializeUser(async (id, done) => {
  try {
    console.log('Deserializing user ID:', id);
    const user = await User.findById(id);
    
    if (!user) {
      console.log('User not found during deserialization');
      return done(new Error('User not found'), null);
    }
    
    console.log('User deserialized successfully:', user.username);
    done(null, user);
  } catch (error) {
    console.error('Deserialization error:', error);
    done(error, null);
  }
});

module.exports = passport;