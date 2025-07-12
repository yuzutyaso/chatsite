import { useState, useEffect } from 'react';
import { supabase, Session } from '../utils/supabase';
import Auth from '../components/Auth';
import Chat from '../components/Chat';
import { sha256 } from 'js-sha256'; // SHA-256ハッシュライブラリ

// Profileの型定義 (components/Chat.tsxと共通化すると良い)
interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  short_id: string;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [friendProfiles, setFriendProfiles] = useState<Profile[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null); // 現在選択中の友達

  useEffect(() => {
    // セッションの取得と認証状態の変化を監視
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        // 認証後、ユーザープロフィールを取得/作成
        upsertProfile(session.user.id, session.user.email);
      } else {
        setMyProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user && myProfile) {
      // ログイン済みの場合は友達リストをロード
      fetchFriends();
    }
  }, [session, myProfile]); // session または myProfile が変更されたら友達リストを再ロード

  const upsertProfile = async (userId: string, userEmail: string | undefined) => {
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116は「0行返された」エラー
      console.error('Error fetching profile:', fetchError);
      return;
    }

    if (!existingProfile) {
      // プロフィールが存在しない場合のみ作成
      // short_idをメールアドレスのSHA-256ハッシュの最初の7文字として生成
      const generatedShortId = userEmail ? sha256(userEmail).substring(0, 7) : 'guest_id';

      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          username: `User-${Math.random().toString(36).substring(7)}`, // 仮のユーザー名
          short_id: generatedShortId,
          avatar_url: null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting new profile:', insertError);
      } else {
        setMyProfile(newProfile);
      }
    } else {
      setMyProfile(existingProfile);
    }
  };

  const fetchFriends = async () => {
    if (!myProfile) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('friends')
      .select(`
        friend_id,
        profiles (id, username, avatar_url, short_id)
      `)
      .eq('user_id', myProfile.id);

    if (error) {
      console.error('Error fetching friends:', error);
      setFriendProfiles([]);
    } else {
      // friend_id の Profiles オブジェクトを直接 friendProfiles に設定
      const friendsData = data
        .map(f => f.profiles as Profile)
        .filter(profile => profile !== null); // nullでないプロフィールのみをフィルタリング
      setFriendProfiles(friendsData);

      // 初めて友達リストをロードしたときに最初の友達を選択
      if (!selectedFriend && friendsData.length > 0) {
        setSelectedFriend(friendsData[0]);
      }
    }
    setLoading(false);
  };

  const [friendIdToSearch, setFriendIdToSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const handleSearchFriend = async (event: FormEvent) => {
    event.preventDefault();
    if (!friendIdToSearch.trim()) return;

    setLoadingSearch(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('short_id', friendIdToSearch.trim())
      .limit(1); // short_idはユニークなので1件のみ取得

    if (error) {
      console.error('Error searching friend:', error);
      setSearchResults([]);
    } else {
      // 検索結果から自分を除外
      const filteredResults = data.filter(profile => profile.id !== session?.user.id);
      setSearchResults(filteredResults);
    }
    setLoadingSearch(false);
  };

  const handleAddFriend = async (friendProfileToAdd: Profile) => {
    if (!myProfile || !session) return;

    // 既に友達かどうかチェック
    const isAlreadyFriend = friendProfiles.some(friend => friend.id === friendProfileToAdd.id);
    if (isAlreadyFriend) {
      alert('このユーザーは既に友達です！');
      return;
    }

    // friendsテーブルに両方向の関係を挿入 (LINEのような双方向の友達関係)
    // 常にユーザーIDが小さい方をuser_id、大きい方をfriend_idとして保存するルールにすると重複チェックが楽になる
    const friendEntry1 = {
      user_id: myProfile.id,
      friend_id: friendProfileToAdd.id,
      status: 'accepted' // シンプル化のため、ここでは承認済みとする
    };
    const friendEntry2 = {
      user_id: friendProfileToAdd.id,
      friend_id: myProfile.id,
      status: 'accepted'
    };

    const { error: insertError1 } = await supabase.from('friends').insert(friendEntry1);
    const { error: insertError2 } = await supabase.from('friends').insert(friendEntry2);


    if (insertError1 || insertError2) {
      // ユニーク制約エラーは無視しても良いが、それ以外のエラーは表示
      if (insertError1 && insertError1.code !== '23505') console.error('Error adding friend (entry1):', insertError1);
      if (insertError2 && insertError2.code !== '23505') console.error('Error adding friend (entry2):', insertError2);
      alert('友達追加に失敗しました。');
    } else {
      alert(`${friendProfileToAdd.username || friendProfileToAdd.short_id} を友達に追加しました！`);
      setFriendIdToSearch(''); // 検索バーをクリア
      setSearchResults([]); // 検索結果をクリア
      fetchFriends(); // 友達リストを更新
    }
  };


  if (!session) {
    return <Auth />;
  }

  // ユーザーが認証済みだが、プロフィールがまだ読み込まれていない場合
  if (session && !myProfile) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-xl text-gray-700">プロフィール情報を読み込み中...</p>
    </div>;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* サイドバー（友達リスト、プロフィール編集、友達追加検索） */}
      <div className="w-80 bg-white shadow-lg p-6 flex flex-col">
        <div className="mb-6 pb-4 border-b border-gray-200">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">マイプロフィール</h2>
          {myProfile && (
            <div className="flex items-center space-x-4">
              {myProfile.avatar_url ? (
                <img src={myProfile.avatar_url} alt="My Icon" className="w-16 h-16 rounded-full object-cover border-2 border-blue-500" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-300 flex items-center justify-center text-3xl font-bold text-white">
                  {myProfile.username ? myProfile.username[0].toUpperCase() : 'M'}
                </div>
              )}
              <div>
                <p className="font-semibold text-lg text-gray-900">{myProfile.username || '名前なし'}</p>
                <p className="text-sm text-gray-600">ID: {myProfile.short_id}</p>
                {/* TODO: アイコン変更・プロフィール編集リンク */}
                <button
                  className="mt-2 text-blue-600 hover:underline text-sm"
                  onClick={() => alert('プロフィール編集機能は未実装です！')}
                >
                  プロフィールを編集
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">友達</h2>
          {friendProfiles.length === 0 ? (
            <p className="text-gray-500 text-sm">まだ友達がいません。</p>
          ) : (
            <ul className="space-y-3">
              {friendProfiles.map(friend => (
                <li
                  key={friend.id}
                  className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition duration-200 ${
                    selectedFriend?.id === friend.id ? 'bg-blue-100' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedFriend(friend)}
                >
                  {friend.avatar_url ? (
                    <img src={friend.avatar_url} alt="Friend Icon" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-xl font-bold text-white">
                      {friend.username ? friend.username[0].toUpperCase() : 'F'}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{friend.username || friend.short_id}</p>
                    <p className="text-xs text-gray-500">ID: {friend.short_id}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col mt-auto pt-6 border-t border-gray-200">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">友達を追加</h2>
          <form onSubmit={handleSearchFriend} className="flex space-x-2 mb-4">
            <input
              type="text"
              placeholder="友達のIDを入力 (7文字)"
              value={friendIdToSearch}
              onChange={(e) => setFriendIdToSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={7}
            />
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 transition duration-200"
              disabled={loadingSearch || !friendIdToSearch.trim()}
            >
              {loadingSearch ? '検索中...' : '検索'}
            </button>
          </form>
          {searchResults.length > 0 && (
            <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
              <h3 className="font-semibold text-blue-700 mb-2">検索結果:</h3>
              <ul className="space-y-2">
                {searchResults.map(result => (
                  <li key={result.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      {result.avatar_url ? (
                        <img src={result.avatar_url} alt="Result Icon" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-lg font-bold">
                          {result.username ? result.username[0].toUpperCase() : 'R'}
                        </div>
                      )}
                      <span>{result.username || result.short_id} (ID: {result.short_id})</span>
                    </div>
                    <button
                      onClick={() => handleAddFriend(result)}
                      className="px-3 py-1 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition duration-200"
                    >
                      追加
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {searchResults.length === 0 && friendIdToSearch.trim() && !loadingSearch && (
            <p className="text-gray-500 text-sm mt-2">ユーザーは見つかりませんでした。</p>
          )}
        </div>
      </div>

      {/* メインコンテンツ（チャット表示） */}
      <div className="flex-1">
        {selectedFriend ? (
          <Chat session={session} friendProfile={selectedFriend} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-xl">
            友達を選択してチャットを開始してください
          </div>
        )}
      </div>
    </div>
  );
    }
