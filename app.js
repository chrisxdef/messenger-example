const express = require('express')
const mysql = require('mysql')
const http = require('http')
const util = require('util')
const app = express()
const port = 3000

const httpServer = http.createServer(app)
httpServer.listen(port, 'localhost')

const db = mysql.createConnection({
	host:'localhost',
	user:'root',
	password:'1234567',
	database:'messenger'
});
db.connect(function(err){ if(err) throw err; })

app.use(express.json())

//GET request for App index
app.get('/', function(req, res){
	res.send('Messenger App')
});

//POST request for send message
app.post('/store_message', store_message)

//GET request for list_messages
app.post('/list_messages', list_messages)


//BEGIN send message
async function store_message(req, res){
	//Get json from request
	var data = req.body
	//Check and extract dat
	if(!(validate_send_message_request(res, data))){
		return
	}
	const sender = data['sender']
	const receivers = data['receivers']
	const message = data['message']

	//Filter out any invalid numbers from receivers list
	var valid_receivers = validate_receiver_list(receivers)
	var sender_id
	var receiver_ids = []
	try{
	//Get sender and reciever user ids
		sender_id = (await query_userid(sender))[0]["userid"]
		if(sender_id.length == 0){
			res.send("Invalid sender number. Message not sent.")
			return
		}
		for(const number of valid_receivers){
			receiver_ids.push( (await query_userid(number))[0]["userid"] );
		}
		if(receiver_ids.lenght == 0){
			res.send("No valid receiver number. Message not sent.")
			return
		}
	//Find an existing groud id, or create one
		var this_group_id = await find_group_id(sender_id, receiver_ids)
		if(this_group_id == 0){
			//get largest group id
			var max_group_id = (await query_max_group_id())[0]['MAX(groupid)']
			var new_group_id = max_group_id + 1
			//add new group id
			await insert_group_id(new_group_id);
			//add users to new group
			await insert_user_group(sender_id, new_group_id)
			for(const id of receiver_ids){
				await insert_user_group(id, new_group_id)
			}
			this_group_id = new_group_id
		}
		//Insert the message into the database
		await query_insert_message(sender_id, this_group_id, message)
	}catch(err){
		console.log(err)
		res.send("Message send failed.")
		return
	}

	res.send("Message send succeeded!")
}
//END send message

//BEGIN list messages
async function list_messages(req, res){
	var response = { "messages" : [] }
	//Find group id of users
	var numbers = req.body["participants"]
	var user_ids = []
	try{
		for(const n of numbers){
			user_ids.push((await query_userid(n))[0]["userid"])
		}
		if(user_ids.length < 2){
			res.send("Not enough users.")
			return
		}
		var user_id_0 = user_ids[0]
		var other_ids = user_ids.slice(1)
		var group_id = await find_group_id(user_id_0, other_ids)
		if(group_id == 0){
			res.send(response)
			return
		}
		var messages_query = await query_messages_by_group_id(group_id)
		var messages = []
		for(var i = 0; i < messages_query.length; i++){
			messages.push(messages_query[i]["content"])
		}
		response["messages"] = messages
	}
	catch(err){
		console.log(err)
		return
	}
	//Extract message and create a json
	res.send(response)
}
//END list messages

//Helper functions
//function for validating a nubmer is in E164 standard
function E164(number){
        if(number[0] != "+") return false
        return !(isNaN(number.substring(1)))
}
//function to validate data from send message request
function validate_send_message_request(res, data){
	if(!("sender" in data && "receivers" in data && "message" in data)){
		res.send("JSON request missing parameters.")
		return false
	}

	const sender = data['sender']
	const receivers = data['receivers']
	const message = data['message']

	if( receivers.length > 9){
		res.send("Recipient list conatins more than 9 numbers. Message not sent.")
		return false
	}

	if( message.length > 256 ){
		res.send("Message is longer than 256 characters. Message not sent.")
		return false
	}

	if(!(E164(sender))){
		res.send("Sender's number is invalid. Message not Sent.")
		return false
	}

	return true
}
//function to remvoe any invalid nubmers from receivers list
function validate_receiver_list(receivers){
	var valid_receivers = []
	for( const number of receivers ){
		if(E164(number)) valid_receivers.push(number);
	}
	return valid_receivers
}
// function for getting user ids from a phone numbers
function query_userid(number){
	const query = "SELECT userid FROM users WHERE number=\'"+number+"\';";
	return util.promisify( db.query ).call( db, query )
}
// function for getting a list of group ids for a user di
function query_groupid(userid){
	const query = "SELECT groupid FROM user_groups WHERE userid=\'"+userid+"\';";
	return util.promisify( db.query ).call( db, query )
}
//Get list of numbers by group id
function query_userids_by_groupid(groupid){	
	const query = "SELECT userid FROM user_groups WHERE groupid=\'"+groupid+"\';";
	return util.promisify( db.query ).call( db, query )
}
//Insert message into database
function query_insert_message(senderid, groupid, message){
	const query = "INSERT INTO messages (senderid, groupid, content) VALUES ("+senderid+", "+groupid+", \'"+message+"\');";
	return util.promisify( db.query ).call( db, query )
}
//Finction to find a group id for a given set of users
async function find_group_id(sender_id, receiver_ids){
	// Get group ids of sender
	var group_query_result = await query_groupid(sender_id)
	//extract ids into a list
	var group_ids = []
	for(var i = 0; i < group_query_result.length; i++){
		var row = group_query_result[i]
		group_ids.push(row["groupid"])
	}
	//Find the id for this group
	var this_group_id = 0
	//iterate through list of possible group ids
	var i = 0
	while(this_group_id == 0 && i < group_ids.length){
		var id = group_ids[i]
		//Get users of group id
		var group_user_ids_query = await query_userids_by_groupid(id)
		//Extract user ids into a list
		var group_user_ids = []
		for(var k = 0; k < group_user_ids_query.length; k++){
			group_user_ids.push(group_user_ids_query[k]["userid"])
		}
		//Check if current id is this group's id
		var valid_id = true
		if(group_user_ids.length != receiver_ids.length+1){
			valid_id = false
		}
		var j = 0
		while(valid_id && j < receiver_ids.length){
			if(!(group_user_ids.includes(receiver_ids[j]))){
				valid_id = false
			}
			j++
		}
		if(valid_id) this_group_id = id;
		i++
	}
	return this_group_id
}
//Get messages by a group id
function query_messages_by_group_id(groupid){
	const query = "SELECT content FROM messages WHERE groupid="+groupid+";";
	return util.promisify( db.query ).call( db, query )
}
//Function for creating a group given user ids
function create_group(user_ids){
	//query to get a new group id
	
	//query to add user ids to group table
	
	//return new user id

}
//function to get largest group id
function query_max_group_id(){
	const query = "SELECT MAX(groupid) FROM groups;"
	return util.promisify( db.query ).call( db, query )
}
//function to insert new group id
function insert_group_id(groupid){
	const query = "INSERT INTO groups (groupid) VALUES ("+groupid+");";
	return util.promisify( db.query ).call( db, query )
}
//function to insert group id and user id into user_groups table
function insert_user_group(userid, groupid){
	const query = "INSERT INTO user_groups (userid, groupid) VALUES ("+userid+", "+groupid+");";
	return util.promisify( db.query ).call( db, query )
}
