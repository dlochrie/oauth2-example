
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , OAuth2Provider = require('oauth2-provider').OAuth2Provider
  , MemoryStore = express.session.MemoryStore;

// hardcoded list of <client id, client secret> tuples
var myClients = {
 'abc123': 'ssh-secret',
};

var app = express();


/**
 * BEGIN: ABSTRACT THIS OUT!!!
 */ 

// temporary grant storage
var myGrants = {};

var myOAP = new OAuth2Provider({crypt_key: 'encryption secret', sign_key: 'signing secret'});

// before showing authorization page, make sure the user is logged in
myOAP.on('enforce_login', function(req, res, authorize_url, next) {
  if(req.session.user) {
    next(req.session.user);
  } else {
    res.writeHead(303, {Location: '/login?next=' + encodeURIComponent(authorize_url)});
    res.end();
  }
});

// render the authorize form with the submission URL
// use two submit buttons named "allow" and "deny" for the user's choice
myOAP.on('authorize_form', function(req, res, client_id, authorize_url) {
  res.end('<html>this app wants to access your account... <form method="post" action="' + authorize_url + '"><button name="allow">Allow</button><button name="deny">Deny</button></form>');
});

// save the generated grant code for the current user
myOAP.on('save_grant', function(req, client_id, code, next) {
  if(!(req.session.user in myGrants))
    myGrants[req.session.user] = {};

  myGrants[req.session.user][client_id] = code;
  next();
});

// remove the grant when the access token has been sent
myOAP.on('remove_grant', function(user_id, client_id, code) {
  if(myGrants[user_id] && myGrants[user_id][client_id])
    delete myGrants[user_id][client_id];
});

// find the user for a particular grant
myOAP.on('lookup_grant', function(client_id, client_secret, code, next) {
  // verify that client id/secret pair are valid
  if(client_id in myClients && myClients[client_id] == client_secret) {
    for(var user in myGrants) {
      var clients = myGrants[user];

      if(clients[client_id] && clients[client_id] == code)
        return next(null, user);
    }
  }

  next(new Error('no such grant found'));
});

// embed an opaque value in the generated access token
myOAP.on('create_access_token', function(user_id, client_id, next) {
  var data = 'blah'; // can be any data type or null

  next(data);
});

// (optional) do something with the generated access token
myOAP.on('save_access_token', function(user_id, client_id, access_token) {
  console.log('saving access token %s for user_id=%s client_id=%s', access_token, user_id, client_id);
});

// an access token was received in a URL query string parameter or HTTP header
myOAP.on('access_token', function(req, token, next) {
  var TOKEN_TTL = 10 * 60 * 1000; // 10 minutes

  if(token.grant_date.getTime() + TOKEN_TTL > Date.now()) {
    req.session.user = token.user_id;
    req.session.data = token.extra_data;
  } else {
    console.warn('access token for user %s has expired', token.user_id);
  }

  next();
});

/**
 * END: ABSTRACT THIS OUT!!!
 */

app.configure(function(){
  app.set('port', process.env.PORT || 10011);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.query());
  app.use(express.cookieParser());
  // TODO: THIS IS TEMP!!! DONT PROCEED WITH THIS FOR PROD!
  app.use(express.session({store: new MemoryStore({reapInterval: 5 * 60 * 1000}), secret: 'abracadabra'}));
  app.use(myOAP.oauth());
  app.use(myOAP.login());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

//app.get('/', routes.index);
app.get('/users', user.list);

/**
 * BEGIN: ABSTRACT THESE TO TEMPLATES!!!
 */ 
app.get('/', function(req, res, next) {
  console.dir(req.session);
  res.end('home, logged in? ' + !!req.session.user);
});

app.get('/login', function(req, res, next) {
  if(req.session.user) {
    res.writeHead(303, {Location: '/'});
    return res.end();
  }

  var next_url = req.query.next ? req.query.next : '/';

  res.end('<html><form method="post" action="/login"><input type="hidden" name="next" value="' + next_url + '"><input type="text" placeholder="username" name="username"><input type="password" placeholder="password" name="password"><button type="submit">Login</button></form>');
});

app.post('/login', function(req, res, next) {
  req.session.user = req.body.username;

  res.writeHead(303, {Location: req.body.next || '/'});
  res.end();
});

app.get('/logout', function(req, res, next) {
  req.session.destroy(function(err) {
    res.writeHead(303, {Location: '/'});
    res.end();
  });
});

app.get('/secret', function(req, res, next) {
  if(req.session.user) {
    res.end('proceed to secret lair, extra data: ' + JSON.stringify(req.session.data));
  } else {
    res.writeHead(403);
    res.end('no');
  }
});

app.get('/user/data', function(req, res, next) {
	res.end(JSON.stringify({ user_id: 1, name: 'Joe Bob Smith' }));
});

function escape_entities(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * END: ABSTRACT THESE TO TEMPLATES!!!
 */ 


http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
