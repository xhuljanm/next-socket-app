"use client";
import Link from "next/link"
import { useState } from "react";
import Loading from "@/app/components/loading";

const Home = () => {
    const [loading, setLoading] = useState<boolean>(false);
    return (
        <div className="h-screen w-full bg-primary animate-dark-glow overflow-hidden">
            <section className="relative w-full">
                <div className="relative pt-4 lg:pt-6 flex items-center justify-between text-white font-semibold text-sm leading-6">
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 py-10">
                        <nav className="flex-none">
                            <ul className="flex items-center gap-x-8 px-8 ">
                                <li>
                                    <Link href="/chat" className="text-white hover:cursor-pointer hover:text-primary-white">
                                            Chat Now
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/about" className="text-white hover:cursor-pointer hover:text-primary-white">
                                        About
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/contact" className="text-white hover:cursor-pointer hover:text-primary-white">
                                        Contact
                                    </Link>
                                </li>
                            </ul>
                        </nav>
                    </div>
                </div>
                {loading ? (
                    <div className="flex items-center justify-center h-[100vh] w-full">
                        <Loading />
                    </div>
                ) : (
                    <div className="justify-center flex">
                        <div className="relative max-w-5xl mx-auto pt-20 sm:pt-24 lg:pt-32">
                            <h1 className="bg-primary font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-center dark:text-white">
                                Simple Socket.io Chat
                            </h1>
                            <p className="mt-6 text-base text-slate-600 text-center max-w-3xl mx-auto dark:text-slate-400">
                                A very simple chat application built using:&nbsp;
                                <code className="font-mono font-medium text-sky-500 dark:text-sky-400 animate-pulse">
                                    <a href="https://nextjs.org/" target="_blank">Next.js</a>
                                </code>,
                                <code className="font-mono font-medium text-sky-500 dark:text-sky-400 animate-pulse">
                                    <a href="https://socket.io/" target="_blank">Socket.IO</a>
                                </code>,
                                <code className="font-mono font-medium text-sky-500 dark:text-sky-400 animate-pulse">
                                    <a href="https://www.typescriptlang.org/" target="_blank">&nbsp;TypeScript</a>
                                </code>,
                                and
                                <code className="font-mono font-medium text-sky-500 dark:text-sky-400 animate-pulse">
                                    <a href="https://www.typescriptlang.org/" target="_blank">&nbsp;Tailwind CSS&nbsp;</a>
                                </code>
                                for real-time messaging.
                            </p>
                            <div className="mt-6 sm:mt-10 flex justify-center space-x-6 text-sm">
                                <Link onClick={() => setLoading(true)} href="/chat" className="border-2 border-primary-white hover:border-primary focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-50 text-white font-semibold h-12 px-6 rounded-lg w-full flex items-center justify-center sm:w-auto dark:bg-primary dark:highlight-white/20 dark:hover:bg-primary-white hover:cursor-pointer active:scale-[80%] transition ease-out duration-200">
                                    Start Chatting Now
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    )
};

export default Home;