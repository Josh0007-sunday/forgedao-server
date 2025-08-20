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
      console.log('GitHub profile received:', profile);
      
      let user = await User.findOne({ githubId: profile.id });
      
      if (!user) {
        user = new User({
          githubId: profile.id,
          username: profile.username,
          bio: profile._json.bio || '',
          accessToken: accessToken
        });
      } else {
        user.accessToken = accessToken;
      }
      
      await user.save();
      console.log('User saved/updated:', user.id);
      return done(null, user);
    } catch (error) {
      console.error('Passport error:', error);
      return done(error);
    }
  }
));

// SERIALIZATION FIX - Use the actual user object, not just ID
passport.serializeUser((user, done) => {
  console.log('Serializing user:', user.id);
  done(null, user.id);
});

// DESERIALIZATION FIX - Make sure this works properly
passport.deserializeUser(async (id, done) => {
  try {
    console.log('Deserializing user:', id);
    const user = await User.findById(id);
    if (!user) {
      return done(new Error('User not found'));
    }
    done(null, user);
  } catch (error) {
    console.error('Deserialization error:', error);
    done(error);
  }
});

module.exports = passport;