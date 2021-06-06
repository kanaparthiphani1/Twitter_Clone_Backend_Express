const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwtoken = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("App Successfully up");
    });
  } catch (e) {
    console.log("Db Error is ", e.message);
  }
};

initializeDbAndServer();

validateToken = (req, res, next) => {
  let token;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    token = authHeader.split(" ")[1];
  }
  if (token === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwtoken.verify(token, "secret@1", (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const userPresQuery = `Select * from user where username = '${username}'`;
  const userResp = await db.get(userPresQuery);
  if (userResp === undefined) {
    if (password.length < 6) {
      res.status(400);
      res.send("Password is too short");
    } else {
      const countQuery = `Select count(*) as count from user`;
      const dbUserCount = await db.get(countQuery);

      const postQuery = `
          Insert into user (user_id,name,username,password,gender) values 
          (
              ${dbUserCount.count + 1},
              '${name}',
              '${username}',
              '${hashedPassword}',
              '${gender}'
          )
      `;
      await db.run(postQuery);
      res.send("User created successfully");
    }
  } else {
    res.status(400);
    res.send("User already exists");
  }
});

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const userPresQuery = `Select * from user where username = '${username}'`;
  const dbResp = await db.get(userPresQuery);
  if (dbResp !== undefined) {
    const passCheck = await bcrypt.compare(password, dbResp.password);
    if (passCheck) {
      const payload = { username: username };
      const token = jwtoken.sign(payload, "secret@1");
      console.log(token);

      res.send({ jwtToken: token });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  } else {
    res.status(400);
    res.send("Invalid user");
  }
});

getTweetFeed = (eachObj) => {
  return {
    username: eachObj.username,
    tweet: eachObj.tweet,
    dateTime: eachObj.dateTime,
  };
};

app.get("/user/tweets/feed/", validateToken, async (req, res) => {
  let { username } = req;
  const getLatestTweets = `
        Select 
            (
                Select username from user where user_id = tweet.user_id
            ) as username,
            tweet.tweet as tweet,
            tweet.date_time as  dateTime
        from (user INNER JOIN follower on user.user_id = follower.follower_user_id ) as temp inner join tweet on temp.following_user_id  = tweet.user_id where temp.username = '${username}'
        order by tweet.date_time
        limit 4;
    `;
  const dbResp = await db.all(getLatestTweets);
  const updatedResp = dbResp.map((eachOb) => getTweetFeed(eachOb));
  res.send(updatedResp);
});

app.get("/user/following/", validateToken, async (req, res) => {
  let { username } = req;
  const getFollowingList = `
        Select 
            (
                Select name from user where user_id = follower.following_user_id
            ) as name
        from user inner join follower on user.user_id = follower.follower_user_id where user.username = '${username}'
    `;
  const dbResp = await db.all(getFollowingList);
  res.send(dbResp);
});

app.get("/user/followers/", validateToken, async (req, res) => {
  let { username } = req;
  const getFollowersList = `
        Select 
            (
                Select name from user where user_id = follower.follower_user_id
            ) as name
        from user inner join follower on user.user_id = follower.following_user_id where user.username = '${username}'
    `;
  const dbResp = await db.all(getFollowersList);
  res.send(dbResp);
});

app.get("/tweets/:tweetId/", validateToken, async (req, res) => {
  let { username } = req;
  const { tweetId } = req.params;
  const tweetFollowingCheck = `
        Select * 
        from 
        (user inner join follower on user.user_id = follower.follower_user_id) as temp inner join tweet on temp.following_user_id = tweet.user_id
        where temp.username = '${username}' and tweet.tweet_id = ${tweetId}

    `;
  const tweetDet = await db.get(tweetFollowingCheck);
  if (tweetDet === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const aggregateQuery = `
        Select 
        temp.tweet as tweet,
        COUNT(Distinct temp.like_id) as likes,
        COUNT(Distinct reply.reply_id) as replies,
        temp.date_time as dateTime
        from (tweet inner join like on tweet.tweet_id = like.tweet_id) as temp inner join reply on temp.tweet_id = reply.tweet_id
       where temp.tweet_id = ${tweetId}
      `;
    const dbAggResp = await db.get(aggregateQuery);
    res.send(dbAggResp);
  }
});

likesNames = (namesArr) => {
  let likes = namesArr.map((eachItem) => {
    return eachItem.name;
  });
  return { likes: likes };
};

app.get("/tweets/:tweetId/likes/", validateToken, async (req, res) => {
  let { username } = req;
  const { tweetId } = req.params;
  const tweetFollowingCheck = `
        Select * 
        from 
        (user inner join follower on user.user_id = follower.follower_user_id) as temp inner join tweet on temp.following_user_id = tweet.user_id
        where temp.username = '${username}' and tweet.tweet_id = ${tweetId}

    `;
  const tweetDet = await db.get(tweetFollowingCheck);
  if (tweetDet === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const aggregateQuery = `
        Select 
            (
                Select username from user where user_id = like.user_id
            ) as name
        from 
        tweet inner join like on tweet.tweet_id = like.tweet_id
        where tweet.tweet_id = ${tweetId};
      `;
    const dbAggResp = await db.all(aggregateQuery);
    res.send(likesNames(dbAggResp));
  }
});

app.get("/tweets/:tweetId/replies/", validateToken, async (req, res) => {
  let { username } = req;
  const { tweetId } = req.params;
  const tweetFollowingCheck = `
        Select * 
        from 
        (user inner join follower on user.user_id = follower.follower_user_id) as temp inner join tweet on temp.following_user_id = tweet.user_id
        where temp.username = '${username}' and tweet.tweet_id = ${tweetId}

    `;
  const tweetDet = await db.get(tweetFollowingCheck);
  if (tweetDet === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const aggregateQuery = `
        Select 
            (
                Select name from user where user_id = reply.user_id
            ) as name,
            reply.reply as reply
        from 
        tweet inner join reply on tweet.tweet_id = reply.tweet_id
        where tweet.tweet_id = ${tweetId};
      `;
    const dbAggResp = await db.all(aggregateQuery);
    res.send({ replies: dbAggResp });
  }
});

app.get("/user/tweets/", validateToken, async (req, res) => {
  let { username } = req;
  const userTweetsAggQuery = `
    Select 
    temp.tweet as tweet,
    count(Distinct temp.like_id) as likes,
    count(Distinct reply.reply_id) as replies,
    temp.date_time as dateTime
    from
    (tweet Left join like on tweet.tweet_id = like.tweet_id) as temp left join reply on temp.tweet_id = reply.tweet_id
    where temp.user_id = (
        Select user_id from user where username = '${username}'
    )
    group by temp.tweet_id;
  `;
  console.log(userTweetsAggQuery);

  const dbresp = await db.all(userTweetsAggQuery);
  res.send(dbresp);
});

app.post("/user/tweets/", validateToken, async (req, res) => {
  let { username } = req;
  const { tweet } = req.body;
  const tweetCount = `Select count(*) as count from tweet`;
  const resB = await db.get(tweetCount);
  const { count } = resB;
  const dateTime = new Date();

  const createPostQuery = `
      Insert into tweet (tweet_id,tweet,user_id,date_time) values
      (
          ${count + 1},
          '${tweet}',
          (
              Select user_id from user where username = '${username}'
          ),
          datetime('now','localtime')
      )
    `;
  await db.run(createPostQuery);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", validateToken, async (req, res) => {
  let { username } = req;
  const { tweetId } = req.params;
  const tweetOwnCheck = `
    Select 
        *
    from
    tweet where tweet_id = ${tweetId} and user_id = (
        Select user_id from user where username = '${username}'
    )
  `;
  const dbResp = await db.get(tweetOwnCheck);
  if (dbResp === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const delQuery = `
        DELETE from tweet where tweet_id = ${tweetId}
    `;
    await db.run(delQuery);
    res.send("Tweet Removed");
  }
});

module.exports = app;
