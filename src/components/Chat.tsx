import { useState, useEffect, FormEvent, useRef } from 'react';
import { supabase, Session } from '../utils/supabase';

interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  short_id: string; // SHA-256から生成したID
}

interface Message {
  id: string;
  created_at: string;
  user_id: string;
  room_id: string;
  content: string | null;
  image_url: string | null;
  profiles: Profile | null; // ユーザー情報結合用
}

interface ChatProps {
  session: Session;
  // 仮の相手のユーザーID。実際のアプリでは友達リストから選択する
  friendProfile: Profile;
}

export default function Chat({ session, friendProfile }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 現在のユーザーのプロフィール情報を取得
  const [myProfile, setMyProfile] = useState<Profile | null>(null);

  // チャットルームIDを生成（例: 常に小さい方のIDから先に並べる）
  const getRoomId = (user1Id: string, user2Id: string) => {
    return user1Id < user2Id ? `${user1Id}_${user2Id}` : `${user2Id}_${user1Id}`;
  };
  const currentRoomId = getRoomId(session.user.id, friendProfile.id);

  useEffect(() => {
    async function fetchMyProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (error) {
        console.error('Error fetching my profile:', error);
      } else {
        setMyProfile(data);
      }
    }
    fetchMyProfile();
  }, [session.user.id]);

  useEffect(() => {
    fetchMessages();

    // リアルタイムリスナーの設定
    const messageListener = supabase
      .channel(`room:${currentRoomId}`) // 特定のルームの変更をリッスン
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${currentRoomId}` }, payload => {
        // 新しいメッセージが挿入されたら
        if (payload.eventType === 'INSERT') {
          // プロフィール情報を取得してメッセージに追加
          supabase
            .from('profiles')
            .select('id, username, avatar_url, short_id')
            .eq('id', payload.new.user_id)
            .single()
            .then(({ data: profileData, error }) => {
              if (error) console.error('Error fetching profile for new message:', error);
              setMessages((prevMessages) => {
                const newMessages = [...prevMessages, { ...payload.new, profiles: profileData } as Message];
                // メッセージ数が200件を超えたら古いものを削除（フロントエンド表示のみ）
                // データベース側での自動削除と併用が望ましい
                if (newMessages.length > 200) {
                  return newMessages.slice(newMessages.length - 200);
                }
                return newMessages;
              });
            });
        }
      })
      .subscribe();

    // メッセージが更新されたら一番下までスクロール
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });

    return () => {
      supabase.removeChannel(messageListener);
    };
  }, [currentRoomId, messages.length]); // messages.lengthを依存配列に追加して、メッセージ更新時にスクロール

  const fetchMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        created_at,
        user_id,
        room_id,
        content,
        image_url,
        profiles (id, username, avatar_url, short_id)
      `)
      .eq('room_id', currentRoomId)
      .order('created_at', { ascending: true })
      .limit(200); // 最新200件を取得

    if (error) {
      console.error('Error fetching messages:', error);
    } else {
      setMessages(data || []);
    }
    setLoading(false);
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!newMessage.trim() && !uploadingImage) return;

    const { error } = await supabase.from('messages').insert({
      user_id: session.user.id,
      room_id: currentRoomId,
      content: newMessage,
      // image_urlは別途アップロード後に設定
    });

    if (error) {
      console.error('Error sending message:', error);
    } else {
      setNewMessage('');
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `chat_images/${currentRoomId}/${session.user.id}/${fileName}`;

    setUploadingImage(true);
    const { data, error } = await supabase.storage
      .from('chat-images') // Supabase Storageで作成したバケット名
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      alert('画像のアップロードに失敗しました: ' + error.message);
    } else {
      const { data: publicUrlData } = supabase.storage
        .from('chat-images')
        .getPublicUrl(filePath);

      const imageUrl = publicUrlData.publicUrl;

      // 画像URLをメッセージとして送信
      const { error: messageError } = await supabase.from('messages').insert({
        user_id: session.user.id,
        room_id: currentRoomId,
        image_url: imageUrl,
        content: null, // 画像のみの場合はcontentはnull
      });

      if (messageError) {
        console.error('Error sending image message:', messageError);
      }
    }
    setUploadingImage(false);
    event.target.value = ''; // ファイル選択をリセット
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading || !myProfile) return <p className="text-center text-gray-600 mt-8">読み込み中...</p>;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 text-white shadow p-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {friendProfile.avatar_url ? (
            <img src={friendProfile.avatar_url} alt="Friend Icon" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-xl font-bold">
              {friendProfile.username ? friendProfile.username[0].toUpperCase() : 'F'}
            </div>
          )}
          <h1 className="text-xl font-bold">{friendProfile.username || friendProfile.short_id}</h1>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition duration-200"
        >
          ログアウト
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((message) => {
          const isMyMessage = message.user_id === session.user.id;
          const senderProfile = isMyMessage ? myProfile : friendProfile;
          const senderName = senderProfile?.username || senderProfile?.short_id || 'Unknown';
          const senderAvatar = senderProfile?.avatar_url;

          return (
            <div
              key={message.id}
              className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
            >
              {!isMyMessage && senderAvatar && (
                <img src={senderAvatar} alt="Sender Icon" className="w-8 h-8 rounded-full object-cover mr-2" />
              )}
              <div
                className={`max-w-xs p-3 rounded-xl shadow-md ${
                  isMyMessage
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : 'bg-white text-gray-800 rounded-bl-none'
                }`}
              >
                {!isMyMessage && <p className="font-semibold text-sm mb-1">{senderName}</p>}
                {message.content && <p>{message.content}</p>}
                {message.image_url && (
                  <img
                    src={message.image_url}
                    alt="Chat Image"
                    className="max-w-full h-auto rounded-lg mt-1"
                    style={{ maxHeight: '200px' }} // 画像の最大高さを制限
                  />
                )}
                <span className="text-xs opacity-80 block text-right mt-1">
                  {new Date(message.created_at).toLocaleTimeString()}
                </span>
              </div>
              {isMyMessage && senderAvatar && (
                <img src={senderAvatar} alt="My Icon" className="w-8 h-8 rounded-full object-cover ml-2" />
              )}
            </div>
          );
        })}
        <div ref={chatBottomRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 bg-white shadow-inner flex items-center space-x-3">
        <label htmlFor="image-upload" className="cursor-pointer text-gray-500 hover:text-blue-600 transition duration-200">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            disabled={uploadingImage}
          />
        </label>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="メッセージを入力..."
          className="flex-1 px-4 py-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
          disabled={uploadingImage}
        />
        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-60 transition duration-200 shadow-md"
          disabled={!newMessage.trim() || uploadingImage}
        >
          送信
        </button>
      </form>
    </div>
  );
            }
