import React from 'react';

const About = () => {
  return (
    <div className="h-screen w-full bg-primary animate-dark-glow overflow-hidden">
        <section className="relative w-full">
            <div className="justify-center flex">
                <div className="relative max-w-5xl mx-auto pt-20 sm:pt-24 lg:pt-32">
                    <h1 className="text-3xl text-center font-bold text-white">About</h1>
                    <p className="mt-6 text-base text-slate-600 text-center max-w-3xl mx-auto dark:text-slate-400">
                        This is a simple chat app built using Next.js, Socket.IO, and TypeScript. It&apos;s designed for real-time messaging and easy to use. Just a fun project where i might expand it&apos;s featuers in the future.
                    </p>
                    <p className="mt-6 text-base text-slate-600 text-center max-w-3xl mx-auto dark:text-slate-400">
                        <strong className="block mb-2 text-center">Extra modules currently using:</strong>
                        <ul className="list-disc pl-6 text-left mx-auto max-w-3xl">
                            <li className="mb-1">
                            <strong>Node-Cache:</strong> NPM module to store our rooms/users/messages.
                            </li>
                            <li className="mb-1">
                            <strong>Tailwind Scrollbar:</strong> A Tailwind CSS plugin for customizing scrollbars.
                            </li>
                            <li className="mb-1">
                            <strong>UUID:</strong> NPM module for generating unique identifiers.
                            </li>
                            <li className="mb-1">
                            <strong>Cross-Env:</strong> NPM module to set environment variables across platforms.
                            </li>
                        </ul>
                    </p>
                </div>
            </div>
        </section>
    </div>
  );
};

export default About;