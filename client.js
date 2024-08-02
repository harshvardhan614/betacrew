const net = require('net');
const fs = require('fs');

const HOST = 'localhost'; //choose the local host or we can use the server's IP address
const PORT = 3000; // run on port 3000

let packets = [];
let receivedSequences = new Set();

//write the code of Helper function to parse packet data
function parsePacket(buffer) {
    const symbol = buffer.toString('ascii', 0, 4);
    const buySell = buffer.toString('ascii', 4, 5);
    const quantity = buffer.readInt32BE(5);
    const price = buffer.readInt32BE(9);
    const sequence = buffer.readInt32BE(13);

    return {
        symbol,
        buySell,
        quantity,
        price,
        sequence
    };
}

//write the code of Helper function to create payload for requests
function createPayload(callType, resendSeq = 0) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt8(callType, 0);
    buffer.writeUInt8(resendSeq, 1);
    return buffer;
}

// Create TCP client and connect to server
const client = new net.Socket();
client.connect(PORT, HOST, () => {
    console.log('Connected to BetaCrew exchange server');

    // Send "Stream All Packets" request
    const payload = createPayload(1);
    client.write(payload);
});

client.on('data', (data) => {
    const packet = parsePacket(data);
    packets.push(packet);
    receivedSequences.add(packet.sequence);
});

client.on('close', () => {
    console.log('Connection closed by server');

    // Identifying the missing sequences
    const receivedSequencesArray = Array.from(receivedSequences).sort((a, b) => a - b);
    const missingSequences = [];
    for (let i = 1; i < receivedSequencesArray[receivedSequencesArray.length - 1]; i++) {
        if (!receivedSequences.has(i)) {
            missingSequences.push(i);
        }
    }

    //code for Request missing packets
    const missingPackets = [];
    let pendingRequests = missingSequences.length;
    if (pendingRequests === 0) {
        saveToFile(packets);
    } else {
        missingSequences.forEach((seq) => {
            const resendPayload = createPayload(2, seq);
            const resendClient = new net.Socket();
            resendClient.connect(PORT, HOST, () => {
                resendClient.write(resendPayload);
            });

            resendClient.on('data', (data) => {
                const packet = parsePacket(data);
                missingPackets.push(packet);
                resendClient.destroy();
            });

            resendClient.on('close', () => {
                pendingRequests--;
                if (pendingRequests === 0) {
                    packets = packets.concat(missingPackets).sort((a, b) => a.sequence - b.sequence);
                    saveToFile(packets);
                }
            });
        });
    }
});

//handle errors
client.on('error', (err) => {
    console.error('Error:', err.message);
});

//create a saveToFile function to save data to output.json
function saveToFile(data) {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFile('output.json', jsonData, (err) => {
        if (err) throw err;
        console.log('Data saved to output.json');
    });
}
