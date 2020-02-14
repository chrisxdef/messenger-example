To start the application execute

	nodejs app.js

in the messenger_app directory.

To run the application as a service with pm2, execute

	pm2 start app.js

To stop the service execute

	pm2 stop app.js

cURL examples of sending and listing messages.
	curl -H "Content-Type: application/json" -d @send.json http://159.89.43.66/store_message
	curl -H "Content-Type: application/json" -d @list.json http://159.89.43.66/list_messages	

Format of store_message request.
	{
		"sender" : "+15552220000",
		"receivers" : ["+15554440000", "+15553330000", "+15555550000"],
		"message" : "This is a test."
	}

Format of list_messages request.
	{
       		"participants" : ["+15555550000", "+15554440000", "+15553330000", "+15552220000"]
	}

MySQL Database information.
	Database name : messenger
	Tables:
		users
			userid, number
		groups
			groupid
		user_groups
			userid, groupid
		messages
			senderid, groupid, messageid, content	
