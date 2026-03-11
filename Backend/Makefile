server:
	go run .

generate_pb_files:
	mkdir -p proto/pb
	protoc --go_out=proto/pb --go_opt=paths=source_relative --go-grpc_out=proto/pb --go-grpc_opt=paths=source_relative -Iproto proto/messaging.proto

