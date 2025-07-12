import { useState } from 'react';
import { supabase } from '../utils/supabase';

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      alert(error.message);
    } else {
      alert('メールアドレスを確認して、マジックリンクをクリックしてください！');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2 bg-gray-50">
      <div className="p-8 max-w-md mx-auto bg-white rounded-xl shadow-lg space-y-6">
        <h1 className="text-3xl font-extrabold text-center text-gray-900">チャットへようこそ！</h1>
        <p className="text-gray-600 text-center">マジックリンクでサインインしてください。</p>
        <form onSubmit={handleLogin} className="flex flex-col space-y-4">
          <input
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition duration-200 shadow-md"
            disabled={loading}
          >
            {loading ? '送信中...' : 'マジックリンクを送信'}
          </button>
        </form>
      </div>
    </div>
  );
}
