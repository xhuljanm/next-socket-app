'use client';

import React, { useEffect, useState, useRef, useCallback, Suspense, ChangeEvent } from 'react';
import io from 'socket.io-client';
import { useSearchParams } from 'next/navigation';
import "@/app/globals.css";
import Loading from "@/app/components/loading";

const socket: any = io();

interface Message {
    text: string;
    user: string;
    timestamp?: string;
}

interface SocketError {
    message: string;
    COOLDOWN_MS: number;
    type: string;
}

const Chat: React.FC = () => {
    const searchParams = useSearchParams();
    const room_id = searchParams.get('room');

    const [roomId, setRoomId] = useState<string | null>(room_id);
    const [isInRoom, setIsInRoom] = useState<boolean>(false);
    const [isRoomCreator, setIsRoomCreator] = useState<boolean>(false);

    const [message, setMessage] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);

    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [transport, setTransport] = useState<string>("N/A");

    const [isSidebarOpen, setSidebarOpen] = useState<boolean>(true);

    const [username, setUsername] = useState<string>('');
    const [userId, setUserId] = useState<string | null>(null);
    const [usernameColor, setUsernameColor] = useState<string | null>(null);
    const [usersOnline, setUsersOnline] = useState<number>(0);

    const [error, setError] = useState<string | null>(null);
    const [loadingRoom, setLoadingRoom] = useState<boolean>(true);
    const [rateLimitMessage, setRateLimitMessage] = useState<string>('');
    const [rateLimit, setRateLimit] = useState<boolean>(false);

    const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            requestAnimationFrame(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            });
        }
    }, [isInRoom]);

    const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => (c === 'x' ? Math.random() * 16 | 0 : (Math.random() * 16 | 0) & 3 | 8).toString(16));

    const updateUsername  = (username: string) => {
        setUsername(username);
        if(username.length < 3 || username.length >= 14) {
            localStorage.removeItem('username');
            setError('Username must be between 3 and 14 characters.');
            return;
        }

        setUsernameColor(getRandomColor());
        localStorage.setItem('username', username);
        setError('');
        if(localStorage.getItem('userId')) return;

        const newUserId = generateUUID();
        setUserId(newUserId);
        localStorage.setItem('userId', newUserId);
    };

    useEffect(() => {
        try {
            const storedUsername = localStorage.getItem('username') as string;
            const storedUserId = localStorage.getItem('userId') as string;
            if (storedUsername && storedUserId) {
                setUsername(storedUsername);
                setUserId(storedUserId);
                setUsernameColor(getRandomColor());
            } else {
                setError('Username is required.');
            }
        } catch (error) {
            console.error('Error occurred in useEffect:', error);
            setError('An error occurred while retrieving or setting user data.');
        }
    }, []);

    const getRandomColor = () => {
        const letters = '0123456789ABCDEF';
        return '#' + Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * 16)]).join('');
    };

    const formatTimestamp = (timestamp?: string) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    };

    const sendMessage = useCallback(() => {
        if (message.trim() && username && roomId) {
            const msg: Message = { text: message, user: username, timestamp: new Date().toISOString() };

            console.log(message.trim(), username, roomId, msg);
            socket.emit('chat message', msg);

            if(rateLimitMessage.length === 0) setMessage('');
            if (messageTextareaRef.current) messageTextareaRef.current.style.height = 'auto';
        }
    }, [message, username, roomId, rateLimitMessage]);

    const handleMessageInput = () => {
        const textarea = messageTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';

            const computedStyle = getComputedStyle(textarea);
            const lineHeight = parseFloat(computedStyle.lineHeight);
            const maxHeight = lineHeight * 3; // Show scrollbar if content exceeds 3 lines

            textarea.style.height = `${Math.max(textarea.scrollHeight - 16, lineHeight)}px`;

            textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
        }
    };

    const handleMessageInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setMessage(e.target.value);
        handleMessageInput();
    };

    useEffect(() => {
        handleMessageInput();
    }, []);

    useEffect(() => {
        const handleConnect = () => {
            console.log('Connected to the server.');
            setIsConnected(true);
            if (roomId) {
                if(!username || username.trim() === '') {
                    setError('Username is required.');
                } else {
                    console.log(`Attempting to join room: ${roomId}`);
                    socket.emit('joinRoom', roomId, userId);
                }
            } else {
                setLoadingRoom(false);
            }
        };

        const handleRateLimitError = (error: SocketError) => {
            setRateLimitMessage(error.message);
            setRateLimit(true);
            setTimeout(() => {
                setRateLimit(false);
                setRateLimitMessage('');
            }, error.COOLDOWN_MS);
        };

        const handleMessage = (message: Message) => setMessages(prevMessages => [...prevMessages, message]);
        const handlePreviousMessages = (messages: Message[]) => setMessages(messages);
        const handleError = (error: SocketError) => {
            switch(error.type) {
                case 'cooldown':
                case 'msg_length_limit':
                    handleRateLimitError(error);
                    break;
                default:
                    setError(error.message);
                    setIsInRoom(false);
                    setLoadingRoom(false);
            }
        };

        const handleDisconnect = () => {
            setIsConnected(false);
            setTransport('N/A');
            setIsInRoom(false);
        };

        const handleRoomJoined = (room: string, isRoomCreator: boolean) => {
            isRoomCreator ? setIsRoomCreator(true) : setIsRoomCreator(false);
            setTransport(socket.io.engine.transport.name);
            setRoomId(room);
            setIsInRoom(true);
            setError(null);
            setLoadingRoom(false);
            socket.io.engine.on('upgrade', (transport: { name: React.SetStateAction<string>; }) => {
                setTransport(transport.name);
            });
        };

        handleConnect();

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('roomJoined', handleRoomJoined);
        socket.on('usersOnline', (size: number) => {
            setUsersOnline(size);
        });
        socket.on('message', handleMessage);
        socket.on('previousMessages', handlePreviousMessages);
        socket.on('error', handleError);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
            socket.off('roomJoined', handleRoomJoined);
            socket.off('message', handleMessage);
            socket.off('previousMessages', handlePreviousMessages);
            socket.off('error', handleError);
        };
    }, [roomId, userId, username]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) return;
                e.preventDefault();
                if (message.trim()) {
                    sendMessage();
                } else if (messageTextareaRef.current) {
                    messageTextareaRef.current.style.height = 'auto';
                    messageTextareaRef.current.rows = 1;
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [message, sendMessage]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    const toggleSidebar = () => {
        setSidebarOpen(prev => !prev);
    };

    const createRoom = () => {
        socket.emit('createRoom', userId);
        socket.once('roomCreated', (room: React.SetStateAction<string | null>) => {
            setRoomId(room);
            setIsInRoom(true);
            window.history.replaceState(null, '', `?room=${room}`);
            setError(null);
            console.log('room_created:', room);
        });
    };

    const deleteRoom = () => {
        if (roomId) {
            socket.emit('deleteRoom', room_id, userId);
            socket.once('roomDeleted', () => {
                setIsInRoom(false);
                setRoomId(null);
                setMessages([]);
                window.history.replaceState(null, '', '/chat');
                console.log('Room deleted:', roomId);
                setSidebarOpen(false);
            });
            socket.once('error', (error: SocketError) => {
                setError(error.message);
                console.error('Error deleting room:', error);
            });
        }
    };

    return (
        <div className='antialiased h-full flex'>
            <div className={`bg-secondary flex-shrink-0 overflow-x-hidden bg-token-sidebar-surface-primary transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-[260px]' : 'w-0'}`}>
                <div className={`h-full ${isSidebarOpen ? 'w-[260px]' : 'w-0'}`}>
                    <div className='flex h-full min-h-0 flex-col'>
                        <div className='relative h-full w-full flex-1 items-start'>
                            <nav className='flex h-full w-full flex-col px-3'>
                                <div className='flex justify-between h-[60px] items-center md:h-14'>
                                    <span className='flex'>
                                        <button onClick={toggleSidebar} className='cursor-pointer active:scale-[80%] transition ease-out duration-200'>
                                            <svg className="w-6 h-6 text-gray-500 hover:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 12H5m14 0-4 4m4-4-4-4"/>
                                            </svg>
                                        </button>
                                    </span>
                                </div>

                                <div className='flex-1 flex flex-col justify-center overflow-auto'>
                                        <div className="flex flex-wrap items-center py-4">
                                        <div className='text-center mb-1'>
                                            <h1 className='text-2xl font-semibold text-white'>Chat Room:
                                                <p className={`text-xs ml-1 ${isInRoom ? 'text-green-600' : 'text-red-600'} inline`}>
                                                    {isInRoom ? "ACTIVE" : "DISCONNECTED"}
                                                </p>
                                            </h1>

                                        </div>
                                        <div className='mt-4 flex flex-col items-center gap-4'>
                                            <h1 className="text-2xl font-semibold text-white">
                                                Server:
                                                <p className={`text-xs ml-1 ${isConnected ? 'text-green-600' : 'text-red-600'} inline`}>
                                                    {isConnected ? "CONNECTED" : "DISCONNECTED"}
                                                </p>
                                            </h1>
                                            <h1 className="text-2xl font-semibold text-white">
                                                Transport:
                                                <p className={`text-xs ml-1 ${isConnected ? 'text-green-600' : 'text-red-600'} inline`}>
                                                    {transport.toUpperCase()}
                                                </p>
                                            </h1>
                                            <h1 className="text-xl font-semibold text-white">
                                                Users Online:
                                                <p className={`text-xs ml-1 ${usersOnline ? 'text-green-600' : 'text-red-600'} inline`}>
                                                    {usersOnline}
                                                </p>
                                            </h1>
                                            <input value={username} onChange={(e) => updateUsername(e.target.value)} type='text' placeholder='enter username' className='text-center ml-1 text-xs w-3/4 inline focus:bg-primary-white resize-none bg-transparent transition-all ease-out duration-200 px-4 py-2 text-white border border-secondary-white rounded-full font-semibold focus:outline-none' />
                                            {isRoomCreator && isInRoom && (
                                                <button className="mb-2 hover:bg-red-600 transition-all ease-out duration-200 px-4 py-2 text-white border border-secondary-white rounded-full font-semibold focus:outline-none" onClick={deleteRoom}>
                                                    Delete Room
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </nav>
                        </div>
                    </div>
                </div>
            </div>
            <div className={`bg-primary relative flex h-screen max-w-full flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out`}>
                <main className="relative h-full w-full flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 flex flex-col overflow-auto">
                        {!isSidebarOpen && (
                            <div className='flex justify-between h-[60px] items-center md:h-14'>
                                <span className='flex'>
                                    <button onClick={toggleSidebar} className='ml-1 mt-3 cursor-pointer active:scale-[80%] transition ease-out duration-200'>
                                        <svg className="w-6 h-6 text-gray-500 hover:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 12H5m14 0-4 4m4-4-4-4"/>
                                        </svg>
                                    </button>
                                </span>
                            </div>
                        )}
                    <div className={`h-full flex flex-col ${loadingRoom ? 'overflow-hidden' : 'overflow-auto'} relative custom-scrollbar`}>
                        <article className={`${isSidebarOpen ? 'max-w-[600px]' : 'max-w-[700px]'} mx-auto pb-4 flex flex-col relative w-full flex-1 overflow-hidden custom-scrollbar`}>
                            <div id="messages" className="flex flex-col flex-1 overflow-auto p-4 custom-scrollbar">
                                {loadingRoom ? (
                                    <div className="flex items-center justify-center h-[85vh] w-full">
                                        <Loading />
                                    </div>
                                ) : error ? (
                                    <div className="text-red-500 text-center mt-4">{error}</div>
                                ) : isInRoom ? (
                                    <>
                                        {messages.map((msg, index) => (
                                            <div key={index} className="text-white whitespace-pre-wrap mb-1 break-words">
                                                <div className="text-[1rem]" style={{ color: `${usernameColor}` }}>
                                                    {msg.user} <span className="text-gray-400 text-xs">{formatTimestamp(msg.timestamp)}</span>
                                                </div>
                                                <span className='text-xs'>{msg.text}</span>
                                            </div>
                                        ))}
                                        <div ref={messagesEndRef} />
                                    </>
                                ) : (
                                    <>
                                        <div className="flex flex-col items-center justify-center h-full">
                                            <button className="hover:bg-primary-white transition-all ease-out duration-200 px-4 py-2 text-white border border-secondary-white rounded-full font-semibold focus:outline-none" onClick={createRoom}>
                                                Create Room
                                            </button>
                                        </div>
                                        <p className='animate-pulse mt-10 text-red-600 text-center'>Room will be deleted after 1 hour of inactivity</p>
                                    </>
                                )}
                            </div>
                        </article>
                    </div>
                        <footer className="flex items-center p-4 justify-center w-full max-w-[700px] mx-auto">
                            {isInRoom && !rateLimit ? (
                                <div className="flex w-full max-w-full">
                                    <textarea ref={messageTextareaRef} rows={1} placeholder="Type your message..." value={message} onChange={handleMessageInputChange} className="text-base transition-all ease-out duration-200 mt-0 block resize-none bg-transparent focus:ring-0 focus-visible:ring-0 max-h-[25dvh] w-full max-w-[calc(100%-80px)] px-3 py-2 border border-gray-300 rounded-3xl custom-scrollbar" />
                                    <button className="hover:bg-primary-white transition-all ease-out duration-200 ml-2 px-4 py-2 text-white border border-secondary-white rounded-full font-semibold focus:outline-none" onClick={sendMessage} disabled={!isInRoom} >
                                        Send
                                    </button>
                                </div>
                            ) : (
                                <div className="text-red-500 text-center mt-4">{rateLimitMessage}</div>
                            )}
                        </footer>
                    </div>
                </main>
            </div>
        </div>
    );
};


//https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout
export default function ChatPage() {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-[85vh] w-full"><Loading /></div>}>
        <Chat />
      </Suspense>
    );
}