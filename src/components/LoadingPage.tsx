import React from 'react';

const LoadingPage = () => {
  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
      <h1 className="text-3xl font-bold mb-6 text-[#1b6b5e]">Lagos Permit Hub</h1>
      <div className="w-12 h-12 border-4 border-[#1b6b5e] border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
};

export default LoadingPage;
