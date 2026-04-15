// locales/ja.ts

// ロケール構造全体をデフォルトオブジェクトとしてエクスポートします
export default {
  general: {
    yes: `はい`,
    confirm: `確認`,
    none: `なし`,
    unknown: `不明`,
    defaults: {
      bot_name: `ともり`,
    },
    cooldown_title: `⌛ お待ちください！`,
    cooldown: `再度 \`/{category}\` コマンドを使用するまで {seconds} 秒待つ必要があります。`,
    message_cooldown_title: `⌛ お待ちください！`,
    message_cooldown: `このサーバーの管理者がクールダウンを設定しています。**{botName}** に再度話しかけるには **{seconds}** 秒お待ちください。`,
    message_cooldown_footer_per_user: `サーバー設定: ユーザーごとのクールダウン`,
    message_cooldown_footer_per_channel: `サーバー設定: チャンネルごとのクールダウン`,
    message_cooldown_footer_server_wide: `サーバー設定: サーバー全体のクールダウン`,
    message_cooldown_footer_strict: `サーバー設定: 厳密サーバー全体のクールダウン`,
    interaction: {
      cancel_title: `🔴 コマンドがキャンセルされました`,
      cancel_description: `コマンドはキャンセルされました。`,
      timeout_title: `⏰ コマンドがタイムアウトしました`,
      timeout_description: `時間内に応答しませんでした。もう一度お試しください。`,
    },
    pagination: {
      page_info: `ページ {current}/{total}`,
      previous: `前へ`,
      next: `次へ`,
      cancel: `キャンセル`,
      no_items: `表示する項目がありません。`,
      cancelled: `選択はキャンセルされました。`,
      timeout: `時間内に選択しませんでした。もう一度お試しください。`,
      item_selected: `選択済み: {item}`,
      select_page_title: `ページを選択`,
      select_page_description: `{totalItems}項目から{totalPages}ページ中の表示するページを選択してください：`,
      select_persona_title: `ペルソナを選択`,
      reloading_persona_picker: `ペルソナピッカーを更新しています...`,
      persona_no_attributes: `属性はまだ設定されていません。`,
      persona_select_button: `選択`,
    },
    errors: {
      guild_only_title: `サーバー専用コマンド`,
      guild_only_description: `このコマンドはサーバー内でのみ使用できます。`,
      channel_only_title: `チャンネルが必要です`,
      channel_only_description: `このコマンドは正常に動作するためにチャンネルが必要です。`,
      channel_not_supported_title: `サポートされていないチャンネルタイプ`,
      channel_not_supported_description: `申し訳ありませんが、サーバーのテキストチャンネルまたはダイレクトメッセージでのみ動作します。グループDMやその他のチャンネルタイプはサポートされていません。`,
      tomori_not_setup_title: `初期設定が必要です`,
      tomori_not_setup_description: `このサーバーではまだ私の設定が行われていないようです。\`サーバー管理\`権限を持つメンバーが最初に\`/config setup\`を使用する必要があります。\`/help setup\`で案内を確認でき、\`/config language\`で希望の言語を設定できます。`,
      tomori_updating_title: `現在アップデート中...`,
      tomori_updating_description: `現在アップデート中のため、まもなく復旧します。しばらくしてからもう一度お試しください！`,
      tomori_not_setup_dm_footer: `DMは「ミニサーバー」として扱われ、私はあなたのメッセージに個人的に応答します。ほとんどのサーバー関連コマンドは意図通りに動作します。`,
      api_key_missing_title: `APIキーがありません`,
      api_key_missing_description: `機能するにはAPIキーが必要ですが、このサーバーには設定されていません。\`サーバー管理\`権限を持つメンバーが\`/config api-key set\`を使用して設定できます。`,
      api_key_error_title: `APIキーエラー`,
      api_key_error_description: `設定されたAPIキーへのアクセスまたは復号化で問題が発生しました。\`/config api-key set\`を使用して正しく設定されているか確認してください。`,
      context_error_title: `コンテキスト構築エラー`,
      context_error_description: `会話のコンテキストを理解しようとしているときにエラーが発生しました。`,
      critical_error_title: `重大なエラー`,
      critical_error_description: `予期しない重大なエラーが発生しました。`,
      update_failed_title: `更新に失敗しました`,
      update_failed_description: `データベースの設定の更新に失敗しました。もう一度お試しください。`,
      unknown_error_title: `不明なエラー`,
      unknown_error_description: `予期しないエラーが発生しました。問題が解決しない場合は、\`/support discord\`で報告してください。`,
      unexpected_title: `予期しないエラー`,
      unexpected_description: `予期しないエラーが発生しました：{error}`,
      invalid_option_title: `無効なオプション`,
      invalid_option_description: `選択されたオプションは無効です。有効なオプションを選択してください。`,
      permission_denied_title: `権限がありません`,
      permission_denied_description: `このコマンドを使用する権限がありません。\`サーバー管理\`権限を持つメンバーのみがこのコマンドを使用できます。`,
      server_not_found_title: `サーバーが見つかりません`,
      server_not_found_description: `データベースにサーバー情報が見つかりませんでした。もう一度お試しいただくか、問題が解決しない場合はサポートにお問い合わせください。`,
      generic_error_title: `エラー`,
      generic_error_description: `リクエストの処理中にエラーが発生しました。後でもう一度お試しください。`,
      brave_api: {
        missing_key: {
          title: `Brave APIキーがありません`,
          description: `検索を実行するにはBrave Search APIキーが必要ですが、このサーバーには設定されていません。\`サーバー管理\`権限を持つメンバーが\`/optional-key brave set\`を使用して設定できます。`,
          footer: `/help api-keyで詳細を確認してください`,
        },
      },
      duckduckgo_rate_limit: {
        title: `DuckDuckGoがレート制限されています`,
        description: `DuckDuckGo検索は現在レート制限されています。より信頼性の高い検索のために、\`サーバー管理\`権限を持つメンバーが\`/optional-key brave set\`を使用してBrave Searchを設定できます。`,
        footer: `/help api-keyで詳細を確認してください`,
      },
      operation_failed_title: `操作に失敗しました`,
      operation_failed_description: `要求された操作を完了できませんでした。もう一度お試しください。`,
      provider_not_supported_title: `サポートされていないプロバイダー`,
      provider_not_supported_description: `選択されたAIプロバイダーは現在サポートされていません。`,
      user_blacklisted_title: `ユーザーがブラックリスト登録済み`,
      user_blacklisted_description: `あなたは現在このサーバーのパーソナライズ機能のブラックリストに登録されており、この操作を実行できません。`,
      persona_response_failed_title: `ペルソナの応答に失敗しました`,
      persona_response_failed_description: `ペルソナ **{personaName}** からの応答の生成に失敗しました。もう一度お試しください。`,
      webhook_missing_permissions_title: `Webhook 権限がありません`,
      webhook_missing_permissions_description: `このチャンネルでWebhookを作成できないため、オルタペルソナは通常メッセージで返信します。**Webhookの管理**権限を付与すると、オルタのアバターを表示できます。`,
      webhook_limit_title: `Webhookの上限に達しました`,
      webhook_limit_description: `このチャンネルはDiscordのWebhook上限(10)に達しているため、オルタペルソナは通常メッセージで返信します。不要なWebhookを削除するか、オルタの数を減らしてください。`,
      webhook_unknown_error_title: `Webhook エラー`,
      webhook_unknown_error_description: `このチャンネルでWebhookを作成できなかったため、オルタペルソナは通常メッセージで返信します。権限を確認してもう一度お試しください。`,
      voice_transcription_failed_title: `音声文字起こしに失敗しました`,
      voice_transcription_failed_description: `その音声メッセージを文字起こしできませんでした。もう一度試すか、代わりにテキストで送信してください。`,
    },
    tomori_busy_title: `他の人に返信中です！`,
    tomori_busy_replying: `現在このメッセージに返信中です: {message_link}。あなたのメッセージはキューに追加されました。`,
  },
  rate_limit: {
    user_exceeded_title: `🟡️ レート制限に達しました`,
    user_exceeded_description: `現在、全サーバーで多数のアクティブなメッセージを処理中です。不正利用を防ぐため、最新のトリガー試行は破棄されました。メッセージの処理が完了するまでお待ちください。`,
    server_exceeded_title: `🟡️ サーバー過負荷`,
    server_exceeded_description: `このサーバーでは現在多数のアクティブなメッセージを処理中です。現在キャパシティに達しています！しばらく待ってから再度お試しいただくか、他のサーバーやダイレクトメッセージでご利用ください。`,
    error_memory_critical_title: `🔴 システム過負荷`,
    error_memory_critical_description: `現在メモリ使用率が高く、ファイルアップロードができません。しばらく後にお試しください。`,
    error_quota_exceeded_title: `🔴 1日の上限に達しました`,
    error_quota_exceeded_description: `このコマンドの1日の上限に達しました。クォータは**{reset_time}**にリセットされます。リセット時刻以降に再度お試しください。`,
  },
  genai: {
    generic_error_title: `生成エラー`,
    generic_error_description: `申し訳ありません、応答を生成中にエラーが発生しました ({error_message})。`,
    generic_error_footer: `\`/tool refresh\`を実行してからもう一度お試しください。問題が解決しない場合は、\`/support discord\`で報告してください。`,
    error_stream_timeout_title: `接続タイムアウト`,
    error_stream_timeout_description: `この問題が続く場合、選択したAIプロバイダーに一時的な問題がある可能性があります。後でもう一度お試しいただくか、\`/tool refresh\`を使用してコンテキスト履歴をリフレッシュしてください。`,
    empty_response_title: `空の応答`,
    empty_response_description: `AIから空の応答を受け取りました。この問題が解決しない場合は、\`/tool refresh\`を使用してください。`,
    max_iterations_title: `思考ループ`,
    max_iterations_streaming_description: `思考ループに陥り、リクエストを完了できませんでした。この問題が解決しない場合は、\`/tool refresh\`を使用してください。`,
    still_working_title: `まだ作業中...`,
    still_working_description: `このタスクは通常より多くのステップが必要です。もし止まっていると思ったら、\`/bot kill\` を使用してください。`,
    nai_tool_retry_exhausted_title: `ツールエラー`,
    nai_tool_retry_exhausted_description: `ツールが複数回失敗し、リクエストを完了できませんでした。もう一度お試しいただくか、問題が解決しない場合は \`/tool refresh\` を使用してください。`,
    fallback_used_title: `フォールバックモデルを使用しました`,
    fallback_used_description: `{chain} の代わりに \`{success_model}\` が使用されました`,
    no_response_title: `応答なし`,
    no_response_description: `応答がありませんでした - これはAIからの空の応答またはタイムアウトが原因である可能性があります。`,
    thought_log: {
      title: `思考ログ`,
      description: `元チャンネル: {source_line}`,
      summary_field: `思考サマリー`,
      raw_field: `生の思考`,
      fetched_content_field: `取得コンテンツ`,
      footer: `プロバイダー: {provider} | モデル: {model}`,
    },
    message_interaction: {
      reply_context_author: `返信先: {user}`,
      reply_context_description: `返信先: {message_url}`,
      reply_context_footer: `返信先: {user} • {message_url}`,
    },
    text_quota_exceeded_title: `🔴 テキストクォータを超過しました`,
    text_quota_exceeded_description: `テキスト生成クォータに達しました。{reset_info}`,
    text_user_quota_exceeded_description: `日次テキスト生成クォータに達しました。{reset_info}`,
    text_serverwide_quota_exceeded_description: `このサーバーはこの期間のテキスト生成クォータに達しました。{reset_info}`,
    text_quota_resets_in_hours: `クォータは {hours} 時間後にリセットされます。`,
    text_quota_resets_in_days: `クォータは {days} 日後にリセットされます。`,
    text_quota_exceeded_footer: `このクォータは、このサーバーの管理者が \`/server quota\` で設定しています。`,
    search: {
      web_search_title: `🔍 ウェブで \`{query}\` を検索中...`,
      image_search_title: `🔍 \`{query}\` の画像を検索中...`,
      video_search_title: `🔍 \`{query}\` の動画を検索中...`,
      news_search_title: `🔍 ニュースで \`{query}\` を検索中...`,
      disclaimer_description: `AIによる生成応答と検索結果は不正確または不完全な場合があります。**重要な情報は再確認してください**。`,
    },
    mcp: {
      tool_invoke_title: `🔧 **{server}** の \`{function}\` を使用中...`,
      tool_invoke_description: `パラメーター:`,
      tool_invoke_no_params: `パラメーターなし。`,
    },
    tool_notice: {
      hide_footer: `\`/config notice-embeds visibility\` で非表示にできます`,
      hide_footer_with_kill: `\`/config notice-embeds visibility\` で非表示にできます · 止まっていると思ったら \`/bot kill\` を使用してください`,
    },
    video: {
      youtube_processing_title: `👁️ YouTube動画を視聴中...`,
      youtube_processing_description: `現在、YouTube動画を視聴しています: {video_url}`,
      youtube_processing_footer: `動画の長さに応じて、少し時間がかかる場合があります`,
      generating_title: `🎬 動画を生成中...`,
      generating_description: `現在のプロンプトから動画を作成しています`,
      generating_with_references_description: `現在のプロンプトと参照画像から動画を作成しています`,
      notice_model_line: `**モデル:** {model}`,
      notice_prompt_line: `**プロンプト:** {prompt}`,
      notice_reference_line: `参照元: {message_url}`,
      notice_reference_count_line: `参照画像を {count} 枚使用しています。`,
      generating_footer: `1〜3分ほどかかる場合があります。`,
    },
    document: {
      reading_title: `📄 ドキュメントを読み取り中...`,
      reading_description: `\`{filename}\` の内容を読み取っています`,
      truncated_title: `⚠️ ファイルが省略されました`,
      truncated_description: `\`{filename}\` が長すぎるため、{limit}文字に省略されました（元のサイズ：{original}文字）。応答が不完全な場合があります。ファイルを小さく分割して、一つずつ送ることをお勧めします。`,
    },
    image: {
      generating_title: `🖼️ 画像を生成中...`,
      generating_description: `現在のプロンプトから画像を作成しています`,
      generating_with_references_description: `現在のプロンプトと参照画像を使って画像を作成しています`,
      editing_title: `🖌️ 画像を編集中...`,
      editing_description: `参照画像の \`{edit_target}\` を対象に編集しています`,
      notice_model_line: `**モデル:** {model}`,
      notice_prompt_line: `**プロンプト:** {prompt}`,
      notice_reference_line: `参照元: {message_url}`,
      notice_character_prompt_line: `**キャラクター {index}:** {prompt}`,
      notice_nai_tags_help_line: `より良いNovelAI画像を生成するには \`/novelai image-tags\` を使ってください。`,
      notice_reference_count_line: `参照画像を {count} 枚使用しています。`,
      generating_footer: `プロバイダーの混雑状況によって少し時間がかかる場合があります。`,
    },
    vision: {
      analyzing_title: `🖼️ 画像を解析中...`,
      analyzing_description: `現在のモデルはビジョン非対応です。設定されたビジョンモデルを使用して画像を解析しています`,
      analyzing_footer: `画像の数によって少し時間がかかる場合があります`,
    },
    gif: {
      processing_title: `🎞️ GIFを処理中...`,
      processing_description: `詳細に確認するため、指定されたGIFからキーフレームを抽出しています`,
      processing_footer: `大きいGIFは少し時間がかかる場合があります`,
    },
    fetch: {
      reading_title: `🌐 Webページを読み取り中...`,
      reading_title_page: `🌐 Webページを読み取り中（{page}ページ目）...`,
      reading_description: `{url} を取得して内容を読み取っています`,
      reading_offset_line: `文字 {start_index} から読み取っています`,
      reading_footer: `ページサイズによって少し時間がかかる場合があります`,
    },
    stream: {
      response_stopped_title: `応答が中断されました`,
      response_stopped_description: `次の理由で応答が中断されました: {reason}。送信されたコンテンツがAIプロバイダーにとって大きすぎないか確認してください。\`/tool refresh\`で会話コンテンツをクリアしてください。`,
      streaming_failed_description: `応答をストリーミング中に問題が発生しました。`,
      provider_error_interaction: `ストリーム応答がブロック/停止されました。理由: {reason}。`,
      api_error_title: `🔴 プロバイダーAPIエラー`,
      api_error_tip: `APIキーを確認して再度お試しください。このエラーが解決しない場合は、\`/support discord\`で報告してください。`,
      rate_limit_title: `🟡 プロバイダーレート制限を超過`,
      rate_limit_title_all_rotation_keys: `🟡 全ローテーションキーがレート制限中`,
      rate_limit_tip: `数分お待ちいただいてから再度お試しください。複数の個人キーをお持ちなら、\`/config api-key rotation\` の利用も検討してください。`,
      model_fallback_hint: `耐障害性を高めるには、\`/config model fallback\` でモデルのフェイルオーバーを設定できます。`,
      content_blocked_title: `🔴️ プロバイダーコンテンツフィルター`,
      content_blocked_tip: `ヒント: \`/nsfw jailbreaks\` でこのエラーの回避を試すか、メッセージ(\`/tool refresh\`)、記憶/設定(\`/memory personal export\`、\`/memory server export\`、\`/server config export\`)、問題のあるメンバーをブラックリスト(\`/server user-blacklist add\`)、またはプロバイダを変更(\`/config model\`)を確認してください。`,
      timeout_title: `🟡️ プロバイダーリクエストタイムアウト`,
      timeout_tip: `メッセージを短くするか再度お試しください`,
      provider_overloaded_title: `🔴 プロバイダーの過負荷`,
      provider_overloaded_tip: `プロバイダーが現在過負荷状態です。しばらく後に再度お試しいただくか、別のプロバイダーに変更してください`,
      flush_limit_title: `🟡️ 応答の長さ制限に達しました`,
      flush_limit_description: `この応答はメッセージの最大長制限に達したため停止されました。必要に応じて \`/bot respond\` を使用して手動で応答を続けることができます。`,
      inactivity_timeout_title: `🟡️ 応答がタイムアウトしました`,
      inactivity_timeout_description: `AIプロバイダーからの応答が停止し、接続がタイムアウトしました。プロバイダーが過負荷状態にあるか、問題が発生している可能性があります。もう一度お試しください。`,
    },
    google: {
      "400_default_message": `リクエスト形式にエラーがありました`,
      "400_billing_default_message": `このサービスには課金が必要です`,
      "403_default_message": `APIキーに必要な権限がありません。Google AI Studioから合法的に取得した自分自身のAPIキーを使用していることを確認してください`,
      "404_default_message": `参照されたリソースが見つかりませんでした`,
      "429_default_message": `短時間に多くのリクエストを送信しすぎました`,
      "503_default_message": `AIモデルが現在過負荷状態です`,
      "504_default_message": `リクエストの処理時間が長すぎました`,
      content_blocked_default_message: `あなたのコンテンツは安全フィルターによってブロックされました`,
      unknown_default_message: `予期しないエラーが発生しました`,
    },
    novelai: {
      "400_default_message": `無効なリクエスト形式またはパラメータ`,
      "400_trial_message": `トライアルアカウントでは生成にrecaptcha認証が必要です。API経由のアクセスには有料のNovelAIサブスクリプションが必要です。https://novelai.net/ でアカウントをアップグレードしてください`,
      "401_default_message": `NovelAIのAPIキーが無効または期限切れです`,
      "402_default_message": `Anlasクレジットが不足しています`,
      "429_default_message": `リクエストを送信しすぎています。ペースを落としてください`,
      "503_default_message": `NovelAIサーバーが現在過負荷状態です`,
      "504_default_message": `リクエストの処理時間が長すぎました`,
      unknown_default_message: `予期しないエラーが発生しました`,
    },
    openrouter: {
      "404_privacy_policy_error": `**プライバシーポリシー制限**
選択したモデルは有料モデルトレーニングのためのデータ使用を許可する必要がありますが、OpenRouterアカウントのプライバシー設定で現在ブロックされています。

**修正方法：**
1. https://openrouter.ai/settings/privacy にアクセス
2. 「Data Policy」設定を調整してこのモデルを許可
3. またはプライバシー設定に一致する別のモデルを選択`,
      unknown_default_message: `予期しないエラーが発生しました`,
    },
    anthropic: {
      "400_default_message": `Anthropic APIへのリクエストが無効です。別のモデルを試すか、コンテキスト長を減らしてください。`,
      "401_default_message": `Anthropic APIキーが無効です。console.anthropic.comでキーを確認してください。`,
      "403_default_message": `Anthropic APIキーにこの操作の権限がありません。`,
      "404_default_message": `リクエストされたAnthropicモデルが見つかりません。\`/config model text\`でモデルを切り替えてください。`,
      "429_default_message": `Anthropicのレート制限に達しました。しばらく待ってから再試行してください。`,
      "500_default_message": `Anthropicで内部サーバーエラーが発生しました。`,
      "503_default_message": `Anthropicは現在利用できないか、過負荷状態です。`,
      temperature_top_p_conflict_message: `Anthropic は Temperature と Top-P を同時に受け付けません。\`/config params manage\` を開き、現在のプロバイダーで **Temperature** か **Top-P** のどちらかをオフにしてください。`,
      unknown_default_message: `Anthropicとの通信中に予期しないエラーが発生しました。`,
    },
    self_teach: {
      server_memory_learned_title: `🧠 {persona_nickname}が新しいことを学びました！`,
      server_memory_learned_description: `サーバー記憶を保存しました:
\`{memory_content}\``,
      server_memory_updated_title: `📝 {persona_nickname}が記憶を更新しました！`,
      server_memory_updated_description: `サーバー記憶を更新しました:
\`{memory_content}\``,
      server_memory_deleted_title: `🗑️ {persona_nickname}が記憶を削除しました！`,
      server_memory_deleted_description: `サーバー記憶を削除しました:
\`{memory_content}\``,
      personal_memory_learned_title: `💡 {persona_nickname}が{user_nickname}さんについて新しいことを学びました！`,
      personal_memory_learned_description: `{user_nickname}さんに関する個人的な記憶を保存しました:
\`{memory_content}\``,
      personal_memory_updated_title: `📝 {persona_nickname}が{user_nickname}さんについての記憶を更新しました！`,
      personal_memory_updated_description: `{user_nickname}さんに関する個人的な記憶を更新しました:
\`{memory_content}\``,
      personal_memory_deleted_title: `🗑️ {persona_nickname}が{user_nickname}さんについての記憶を削除しました！`,
      personal_memory_deleted_description: `{user_nickname}さんに関する個人的な記憶を削除しました:
\`{memory_content}\``,
      server_memory_footer: `サーバー管理者は\`/memory server\`でこの記憶を管理できます。`,
      personal_memory_footer_manage: `個人記憶は\`/memory personal\`で管理できます。`,
      personal_memory_footer_personalization_disabled: `この記憶は保存されましたが、現在このサーバーではパーソナライズ機能が無効になっているため、すぐには効果がありません。全文は\`/memory personal export\`で確認できます。\`/personal privacy\`でオプトアウトできます。`,
      personal_memory_footer_user_blacklisted: `この記憶は保存されましたが、対象のユーザーは現在このサーバーのパーソナライズ機能のブラックリストに登録されているため、すぐには効果がありません。全文は\`/memory personal export\`で確認できます。\`/personal privacy\`でオプトアウトできます。`,
    },
  },
  commands: {
    choices: {
      always: `常時`,
      enable: `有効にする`,
      disable: `無効にする`,
      enabled: `有効`,
      disabled: `無効`,
      none: `なし`,
      inherit_global: `グローバルクールダウンを継承`,
    },
    "st-preset": {
      description: `SillyTavernプリセットを管理`,
      import: {
        description: `SillyTavernプリセットJSONファイルをインポート`,
        file_description: `インポートするSillyTavernプリセットの.jsonファイル`,
        invalid_file_title: `無効なファイル`,
        file_too_large_title: `ファイルが大きすぎます`,
        file_too_large_description: `プリセットファイルは{max_size} MB以下にしてください。`,
        download_failed: `添付ファイルのダウンロードに失敗しました。もう一度お試しください。`,
        invalid_json: `ファイルを有効なJSONとして解析できませんでした。`,
        not_a_preset: `これはSillyTavernプリセットではないようです — \`prompts\`配列が見つかりません。`,
        no_nodes: `このプリセットに使用可能なプロンプトノードが見つかりませんでした。`,
        success_title: `プリセットをインポートしました`,
        success_description: `**{name}**をインポートしました。

• **{total}** 合計ノード
• **{markers}** 構造マーカー
• **{toggleable}** 切り替え可能ノード（**{enabled}** 有効）
{notes}
\`/st-preset node toggle\`でアクティブなノードを調整できます。
\`/st-preset remove\`でデフォルトの動作に戻せます。`,
        note_comment_only: `
> **{count}** 個のコメントのみのノードが\`/st-preset node toggle\`で表示されますが、プロンプトには挿入されません。`,
        note_disabled_by_preset: `
> **{count}** 個のノードがこのプリセットでデフォルトで無効になっています。\`/st-preset node toggle\`で有効にできます。`,
      },
      remove: {
        description: `アクティブなSillyTavernプリセットを削除`,
        no_preset_title: `アクティブなプリセットがありません`,
        no_preset_description: `このサーバーにアクティブなSillyTavernプリセットがありません。削除するものがありません。`,
        failed_title: `削除に失敗しました`,
        failed_description: `プリセットの削除に失敗しました。もう一度お試しください。`,
        success_title: `プリセットを削除しました`,
        success_description: `**{name}**を削除しました。コンテキスト組み立てがデフォルトの動作に戻りました。`,
      },
      node: {
        description: `プリセットのプロンプトノードを管理`,
        toggle: {
          description: `プリセットのプロンプトノードのオン・オフを切り替え`,
          no_preset_title: `プリセットが見つかりません`,
          no_preset_description: `このサーバーにアクティブなSillyTavernプリセットがありません。まず\`/st-preset import\`でインポートしてください。`,
          no_nodes_title: `切り替え可能なノードがありません`,
          no_nodes_description: `このプリセットには切り替え可能なプロンプトノードがありません。`,
          select_page_title: `ページを選択`,
          select_page_description: `**{preset_name}**には**{total_nodes}**個の切り替え可能なノードが**{total_pages}**ページにわたってあります。
ページを選択してノードを表示・切り替え:`,
          group_description: `チェックで有効、チェック解除で無効`,
          done_button: `完了`,
          no_changes: `変更なし`,
          result_title: `ノード切り替え結果`,
          result_description: `**{enabled}** / **{total}** ノードが有効。

{changes}`,
        },
      },
    },
    tool: {
      ping: {
        description: `ボットの遅延を確認します`,
        title: `ポン！ 🏓`,
        response_fast: `応答時間: \`{response_time}ms\``,
        response_slow: `応答時間: \`{response_time}ms\``,
      },
      estimate: {
        description: `利用量と費用の見積もり`,
        cost: {
          description: `有料AIプロバイダーのAPI費用を見積もる`,
          title: `推定API費用`,
          embed_description: `Discordチャンネルでのトリガーあたりの**非常におおまかな**推定費用です。費用は**{provider}**の例を使用して推定されています（入力：{inputPrice}/百万トークン、出力：{outputPrice}/百万トークン）`,
          current_context_description: `あなたの**現在のコンテキストのみ**を対象にした推定費用です。入力トークンは、現在の設定と直近のチャンネル履歴を使って、**{provider}** のモデル **{model}** でプロバイダーAPI計測を行います。出力トークンは推定値です。使用価格: 入力 {inputPrice}/百万、出力 {outputPrice}/百万。`,
          current_input_title: `計測済み入力トークン（現在のコンテキスト）`,
          current_input_value: `**入力:** {inputTokens} トークン
**入力コストのみ:** 1トリガーあたり約 {inputCost}`,
          current_output_short_title: `推定出力: 短め`,
          current_output_typical_title: `推定出力: 標準`,
          current_output_long_title: `推定出力: 長め`,
          current_output_band_value: `**出力推定:** {outputTokens} トークン
**合計推定:** {totalTokens} トークン
**費用:** 1トリガーあたり約 {costPerMessage}（100トリガーあたり約 {costPer100}）`,
          current_footer: `入力トークンは、ライブ計測に対応したプロバイダーでのみプロバイダー計測値になります。出力トークンは推定値です。`,
          no_cost_provider_description: `現在のプロバイダーには費用がありません`,
          unavailable_description: `現在のプロバイダー（**{provider}**）ではライブ費用見積もりを利用できません。`,
          fallback_notice_title: `ライブ計測を利用できません`,
          fallback_notice_value: `現在の設定ではライブのプロバイダートークン計測を利用できなかったため、この表示はおおまかな代替推定です。`,
          minimum_scenario_title: `最小シナリオ（軽量使用）`,
          minimum_scenario_value: `**コンテキスト：** 1ユーザー、メモリなし、1段落のペルソナ、会話は1メッセージあたり1文未満
**トークン数：** {inputTokens} 入力 + {outputTokens} 出力 = {totalTokens} 合計
**費用：** ~{costPerMessage} /トリガー（~{costPer100} /100トリガー）`,
          average_scenario_title: `平均シナリオ（中程度使用）`,
          average_scenario_value: `**コンテキスト：** 3ユーザー（各10メモリ）、~16段落のペルソナ（属性と対話を含む）、会話は1メッセージあたり1〜2文
**トークン数：** {inputTokens} 入力 + {outputTokens} 出力 = {totalTokens} 合計
**費用：** ~{costPerMessage} /トリガー（~{costPer100} /100トリガー）`,
          maximum_scenario_title: `最大シナリオ（重量使用）`,
          maximum_scenario_value: `**コンテキスト：** 5ユーザー（各25メモリ）、~31段落のペルソナ（属性と対話を含む）、会話は1メッセージあたり2段落
**トークン数：** {inputTokens} 入力 + {outputTokens} 出力 = {totalTokens} 合計
**費用：** ~{costPerMessage} /トリガー（~{costPer100} /100トリガー）`,
          breakdown_title: `費用に影響する要因`,
          breakdown_value: `**入力トークン（AIに送信されるコンテキスト）：**
- ペルソナの段落数（属性とサンプル対話を含む）
- サーバー＆個人メモリ
- 有効化されたツール（ある場合）
- ユーザーステータス＆リマインダー
- 最近の会話履歴（プロバイダーがサポートしている場合、画像、動画、スタンプ、絵文字、埋め込みを含む）
- サーバー絵文字（常に10個）

**出力トークン（AI応答）：**
- 応答の長さはクエリの複雑さによって異なります
- より詳細な質問 = より長い応答 = より高い費用

**費用を削減するヒント：**
サーバー内の悪用者やスパマーによる費用を削減するための組み込み機能がありますが、以下の追加のヒントもあります：
- ペルソナの段落数を少なくする（属性と対話）
- メモリを簡潔に保つ
- 無料のAIプロバイダーを使用する（Google Gemini無料プラン）
- 自動トリガーチャンネルを制限する`,
          footer: `Google Gemini（無料プラン）や一部のOpenRouterモデルなどの無料プロバイダーは費用がかかりません！NovelAIはサブスクリプション制で無制限に使用できます。プロバイダーの詳細は\`/help api-key\`をご覧ください。`,
        },
      },
      compact: {
        description: `最近の会話をコンパクトなシステム要約にまとめます。`,
        channel_description: `要約を投稿するチャンネル（省略時はこのチャンネルに投稿）。`,
        modal: {
          title: `コンパクト要約`,
          type_label: `要約タイプ`,
          type_description: `生成する要約形式を選択してください。`,
          type_choice_conversation: `会話`,
          type_choice_roleplay: `ロールプレイ`,
          refresh_label: `コンテキストをリフレッシュ?`,
          refresh_description: `はいの場合、この要約より上のメッセージは無視されます。`,
          analyze_images_label: `画像を解析?`,
          analyze_images_description: `添付・絵文字・スタンプの画像解析を含めます。`,
          additional_instructions_label: `追加指示`,
          additional_instructions_placeholder: `任意: 要約への追加の指示を入力してください。`,
        },
        processing_title: `⏳ 要約中`,
        processing_description: `最近の会話を要約しています...`,
        success_title: `✅ 要約を投稿しました`,
        success_description: `コンパクト要約をこのチャンネルに投稿しました。`,
        success_description_redirect: `コンパクト要約を {channel} に投稿しました。`,
        failed_title: `要約に失敗しました`,
        failed_description: `要約の生成に失敗しました: {error}`,
        provider_unsupported_title: `未対応のプロバイダー`,
        provider_unsupported_description: `現在のプロバイダー ({provider}) はコンパクト要約に未対応です。対応プロバイダーに切り替えてください。`,
        model_incompatible_title: `モデル非対応`,
        model_incompatible_description: `現在のモデル ({model_name}) はロールプレイ要約に必要な構造化出力 (STRUCT) に対応していません。`,
        image_vision_required_title: `画像認識が必要`,
        image_vision_required_description: `現在のモデル ({model_name}) は画像解析に対応していません。画像解析をオフにするか、対応モデルを選択してください。`,
        summary_title: `🧠 コンパクト要約`,
        summary_title_refreshed: `🧹 コンパクト要約 (リフレッシュ)`,
        roleplay_scene_title: `🎭 ロールプレイのシーン要約`,
        roleplay_scene_title_refreshed: `🧹 ロールプレイのシーン要約 (リフレッシュ)`,
        roleplay_scene_synopsis_header: `現在のストーリーのあらすじ:`,
        roleplay_character_title_prefix: `🎭 キャラクター要約:`,
        roleplay_labels: {
          current_goals: `直近の目標`,
          emotional_status: `現在の感情状態`,
          physical_status: `現在の身体の状態`,
          appearance_clothing: `外見・服装`,
          inventory: `所持品`,
        },
        refresh_footer: `この埋め込みからコンテキストがリフレッシュされました。`,
      },
      refresh: {
        description: `最近の会話履歴をクリアします。`,
        title: `🧹 会話履歴がクリアされました`,
        response: `コンテキストがリフレッシュされました。これより上のすべてのメッセージは無視されます。`,
      },
      status: {
        description: `現在の個人、サーバー、またはペルソナのステータスを表示します。`,
        scope_description: `どのスコープのステータスを表示しますか？`,
        scope_choice_personal: `個人`,
        scope_choice_server: `サーバー`,
        scope_choice_persona: `ペルソナ`,
        personal_title: `個人ステータス`,
        personal_description: `あなたの個人設定とグローバル個人メモリ`,
        server_page1_title: `サーバーステータス: モデルとサンプリング`,
        server_page1_description: `言語モデルとサンプラー設定`,
        server_page2_title: `サーバーステータス: 動作設定`,
        server_page2_description: `タイミング、上限、クールダウン設定`,
        server_page3_title: `サーバーステータス: チャンネルと自動化`,
        server_page3_description: `自動チャット、RPチャンネル、ホワイトリスト、ランダムトリガー`,
        server_page4_title: `サーバーステータス: 機能とモデレーション`,
        server_page4_description: `機能トグルとモデレーション設定`,
        server_page5_title: `サーバーステータス: システムプロンプト`,
        server_page5_description: `現在のサーバーシステムプロンプトのプレビュー`,
        server_page6_title: `サーバーステータス: モデル上書き`,
        server_page6_description: `チャンネルとペルソナのモデル上書き`,
        server_page7_title: `サーバーステータス: クォータ`,
        server_page7_description: `画像・テキストのクォータ設定を完全表示`,
        persona_page1_title: `{persona_name}: アイデンティティ`,
        persona_page1_description: `ペルソナのアイデンティティとトリガーワード`,
        persona_page2_title: `{persona_name}: 属性`,
        persona_page2_description: `ペルソナ属性の省略表示`,
        persona_page3_title: `{persona_name}: サンプル対話`,
        persona_page3_description: `ペルソナのサンプル対話ペアの省略表示`,
        persona_page4_title: `{persona_name}: 記憶`,
        persona_page4_description: `あなた向けのペルソナ個人メモリとサーバーメモリ`,
        persona_page5_title: `{persona_name}: プロンプトとタグ`,
        persona_page5_description: `ペルソナプロンプトと生成タグ`,
        field_model: `AIモデル`,
        field_temperature: `温度`,
        field_top_p: `トップP`,
        field_top_k: `トップK`,
        field_min_p: `最小P`,
        field_frequency_penalty: `頻度ペナルティ`,
        field_presence_penalty: `存在ペナルティ`,
        field_omitted_params: `無効化したパラメーター`,
        field_humanizer: `ヒューマナイザーレベル`,
        field_timezone: `サーバータイムゾーン`,
        field_message_fetch_limit: `メッセージ取得上限`,
        field_autoch_threshold: `自動チャットモード`,
        field_autoch_channels: `自動チャットチャンネル`,
        field_rp_channels: `RPチャンネル`,
        field_private_channels: `プライベートチャンネル`,
        field_crosschannel_blocklist: `クロスチャンネルブロックリスト`,
        field_thought_logs_channel: `思考ログチャンネル`,
        field_welcome_channel: `ウェルカムチャンネル`,
        field_whitelist_personas: `ペルソナホワイトリスト`,
        field_whitelist_channels: `チャネルホワイトリスト`,
        field_whitelist_roles: `ロールホワイトリスト`,
        whitelist_personas_all_allowed: `なし（全ペルソナ許可）`,
        whitelist_all_allowed: `なし（全チャンネル許可）`,
        whitelist_roles_all_allowed: `なし（全ロール許可）`,
        field_random_triggers: `ランダムトリガー`,
        field_channel_llm_overrides: `チャンネルモデル上書き`,
        field_persona_llm_overrides: `ペルソナモデル上書き`,
        random_trigger_persona_random: `ランダム`,
        field_cooldown_type: `クールダウンタイプ`,
        field_cooldown_length: `クールダウン時間`,
        field_cooldown_length_value: `{seconds}秒`,
        field_self_reply_limit: `自己返信上限`,
        field_send_message_limit: `送信上限`,
        field_always_reply: `常時応答`,
        field_triggered_persona_limit: `トリガーペルソナ上限`,
        field_personalization: `個人の記憶`,
        field_self_teach: `自己学習`,
        field_manage_message: `メッセージ管理ツール`,
        field_hide_respond_embed: `応答埋め込みを非表示`,
        field_self_debug: `セルフデバッグエラー埋め込み`,
        field_blacklisted_members: `ブラックリスト登録済みメンバー`,
        field_api_key_set: `APIキー設定済み`,
        field_brave_api_key_set: `Brave APIキー設定済み`,
        field_emoji_usage: `絵文字使用`,
        field_sticker_usage: `スタンプ使用`,
        field_web_search: `ウェブ検索`,
        field_image_generation: `画像生成`,
        field_videogen: `動画生成`,
        field_server_memteaching: `サーバー記憶の学習`,
        field_attribute_memteaching: `属性の学習`,
        field_sampledialogue_memteaching: `サンプル対話の学習`,
        field_hide_impersonation: `なりすまし埋め込みを非表示`,
        field_uncensor_injection: `インジェクション対策プロンプト`,
        field_uncensor_unicode: `Unicode空白置換`,
        field_uncensor_sanitize: `ワードサニタイズ`,
        field_image_quota_enabled: `画像クォータ有効`,
        field_image_quota_daily_user: `画像 1日あたりユーザークォータ`,
        field_image_quota_serverwide: `画像 サーバー全体クォータ`,
        field_image_quota_reset_days: `画像クォータ リセット周期`,
        field_text_quota_enabled: `テキストクォータ有効`,
        field_text_quota_daily_user: `テキスト 1日あたりユーザークォータ`,
        field_text_quota_serverwide: `テキスト サーバー全体クォータ`,
        field_text_quota_reset_days: `テキストクォータ リセット周期`,
        field_quota_reset_days_value: `{days}日`,
        field_quota_unlimited: `無制限`,
        field_nickname: `ニックネーム`,
        field_is_alter: `オルターペルソナ`,
        field_alter_triggers: `オルタートリガー`,
        field_persona_triggers: `ペルソナトリガー`,
        field_persona_model: `ペルソナモデル上書き`,
        persona_model_server_default: `サーバーデフォルト`,
        field_system_prompt: `システムプロンプト`,
        field_persona_prompt: `ペルソナプロンプト`,
        field_persona_prompt_not_set: `*(未設定)*`,
        field_nai_tags: `NAI画像タグ`,
        field_nai_attg: `NAI ATTGメタデータ`,
        nai_attg_not_set: `*(未設定)*`,
        field_user_nickname: `ユーザーニックネーム`,
        field_language_pref: `言語設定`,
        field_privacy: `プライバシーモード`,
        field_impersonation_prompt: `なりすましプロンプト`,
        field_impersonation_prompt_not_set: `*(未設定)*`,
        field_reminders_count: `アクティブなリマインダー`,
        item_count: `{count} 件`,
        unknown_channel: `不明なチャンネルID:`,
        export_footer_global_personal_memories: `完全な値を表示するには \`/memory personal export scope:global\` を使用してください`,
        export_footer_persona_memories: `完全な値を表示するには \`/memory personal export scope:persona\` と \`/memory server export\` を使用してください`,
        export_footer_persona_attributes_and_dialogues: `完全な属性とサンプル対話を表示するには \`/persona export\` を使用してください`,
        export_footer_server_config: `完全な値を表示するには \`/server config export\` を使用してください`,
        field_global_personal_memories_with_count: `グローバル個人メモリ ({current}/{max} 枠使用中)`,
        field_attributes_with_count: `属性 ({current}/{max} 枠使用中)`,
        field_sample_dialogues_with_count: `サンプル対話 ({current}/{max} 枠使用中)`,
        field_persona_personal_memories_with_count: `ペルソナ個人メモリ ({current}/{max} 枠使用中)`,
        field_persona_server_memories_with_count: `ペルソナサーバーメモリ ({current}/{max} 枠使用中)`,
        field_blacklisted_members_with_count: `{current} 人`,
      },
      comment: {
        description: `チャットに表示されるが、コンテキストには表示されないコメントを送信します。`,
        modal_title: `コメントを作成`,
        content_label: `コメント内容`,
        content_placeholder: `ここにコメントを入力してください...`,
        invalid_channel_title: `無効なチャンネル`,
        invalid_channel_description: `このコマンドはサーバーのテキストチャンネルまたはスレッドでのみ使用できます。`,
        footer: `{user}によるコメント、コンテキストには非表示`,
        success_title: `コメント投稿済み`,
        success_description: `コメントがこのチャンネルに投稿されました。`,
      },
      delete: {
        description: `ターンやチャンネルのコンテンツを削除します。`,
        turn: {
          description: `チャンネルから最後のペルソナのターンを削除します。`,
          regenerate_description: `trueの場合、削除後にペルソナを再トリガーします。`,
          select_persona_description: `trueの場合、削除するペルソナのターンを選択できます。`,
          no_permission_title: `権限が不足しています`,
          no_permission_description: `このコマンドにはサーバー管理権限が必要か、指定されたRPチャンネルで使用する必要があります。`,
          already_running_title: `削除中です`,
          already_running_description: `このチャンネルではすでに削除処理が進行中です。しばらくお待ちください。`,
          no_persona_found_title: `ペルソナのターンが見つかりません`,
          no_persona_found_description: `最近の履歴にペルソナの連続したメッセージブロックが見つかりませんでした。`,
          deleting_title: `⏳ ターンを削除中`,
          deleting_description: `**{persona_name}** の {count} 件のメッセージを削除中...`,
          success_title: `✅ ターンが削除されました`,
          success_description: `**{persona_name}** の {count} 件のメッセージを削除しました。`,
          success_regenerate_description: `**{persona_name}** の {count} 件のメッセージを削除しました。再トリガー中...`,
          partial_title: `⚠️ 一部削除されました`,
          partial_description: `**{persona_name}** の {deleted_count}/{total_count} 件のメッセージを削除しました。一部のメッセージは削除できませんでした。`,
        },
      },
    },
    data: {
      export: {
        type_choice_persona_personal_memories: `ペルソナの個人メモリ`,
        type_choice_persona_server_memories: `ペルソナのサーバーメモリ`,
        type_choice_personal_settings: `個人設定`,
        type_choice_server_config: `サーバー設定`,
        type_choice_global_personal_memories: `グローバル個人メモリ`,
        persona_modal_title: `ペルソナを選択`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `記憶データをエクスポートする対象ペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        success_title: `🟢 エクスポート成功`,
        success_description: `{type}データがDMに送信されました！`,
        failed_title: `🔴 エクスポート失敗`,
        failed_description: `データのエクスポートに失敗しました。後でもう一度お試しください。`,
        dm_title: `データエクスポート`,
        dm_description: `リクエストされた{type}データをお送りします！`,
        dm_failed_title: `🔴 DMを送信できませんでした`,
        dm_failed_description: `DMを送信できませんでした。サーバーメンバーからのDMを有効にしてから、もう一度お試しください。`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `サーバーデータをエクスポートするには**サーバー管理**権限が必要です。`,
        error_no_user_data: `ユーザーデータが見つかりません。まずボットとやり取りする必要があるかもしれません。`,
        error_no_server_data: `サーバーがデータベースに見つかりません。まず /config setup を実行してください。`,
        error_no_server_config: `サーバー設定が見つかりません。まず /config setup を実行してください。`,
        error_no_personality_data: `このサーバーの性格データが見つかりません。まず /config setup を実行してください。`,
        error_validation_failed: `エクスポートデータ構造の検証に失敗しました`,
        error_export_failed: `データのエクスポートに失敗しました`,
      },
      import: {
        persona_modal_title: `ペルソナを選択`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `このインポートを適用するペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        success_title: `🟢 インポート成功`,
        success_description: `{type}データを正常にインポートしました！
インポートされたメモリ: {memories_count}
 更新された設定フィールド: {config_count}`,
        failed_title: `🔴 インポート失敗`,
        failed_description: `データのインポートに失敗しました。ファイルを確認してもう一度お試しください。`,
        cancelled_title: `🔴 インポートがキャンセルされました`,
        cancelled_description: `インポートがキャンセルされました。データは変更されていません。`,
        invalid_file_title: `🔴 無効なインポートファイル`,
        invalid_file_description: `インポートファイルの形式が無効または互換性がありません。`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `サーバーデータをインポートするには**サーバー管理**権限が必要です。`,
        error_invalid_memory: `無効なメモリコンテンツ: {details}`,
        error_update_failed: `データベースのユーザーデータの更新に失敗しました`,
        error_import_failed: `データのインポートに失敗しました`,
        error_no_server_data: `サーバーがデータベースに見つかりません。まず /config setup を実行してください。`,
        error_invalid_server_memory: `無効なサーバーメモリコンテンツ: {details}`,
        error_invalid_config: `インポートデータに無効な設定フィールドがあります`,
        error_no_users: `データベースにユーザーが見つかりません。サーバーメモリを帰属できません。`,
        error_not_json: `インポートファイルは有効なJSONオブジェクトである必要があります`,
        error_incompatible_version: `互換性のないインポートバージョン。期待値: {expected}、実際値: {actual}`,
        error_invalid_personal_format: `無効な個人インポートファイル形式`,
        error_invalid_server_format: `無効なサーバーインポートファイル形式`,
        error_invalid_personal_memories_format: `無効な個人メモリインポートファイル形式`,
        error_invalid_server_memories_format: `無効なサーバーメモリインポートファイル形式`,
        error_invalid_personal_settings_format: `無効な個人設定インポートファイル形式`,
        error_invalid_server_config_format: `無効なサーバー設定インポートファイル形式`,
        error_unknown_type: `不明なインポートタイプ: {type}`,
      },
      delete: {
        confirmation_required_title: `確認が必要です`,
        confirmation_required_description: `削除を確認するには確認オプションを選択する必要があります。`,
        success_personal_settings_title: `🟢 個人設定をリセットしました`,
        success_personal_settings_description: `個人設定をデフォルトに戻しました。`,
        success_server_config_title: `🟢 サーバー設定をリセットしました`,
        success_server_config_description: `サーバー設定をデフォルトに戻しました。`,
        no_data_title: `🟡️ データが見つかりません`,
        no_data_description: `データベースに個人データが保存されていません。`,
        no_server_data_title: `🟡️ サーバーデータが見つかりません`,
        no_server_data_description: `このサーバーにはデータが保存されていません。まず \`/config setup\` を実行してください。`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `サーバーデータを削除するには**サーバー管理**権限が必要です。`,
      },
    },
    persona: {
      description: `人格プリセットを管理する`,
      attribute: {
        description: `ペルソナの属性を管理します。`,
        add: {
          description: `ペルソナに属性を追加します。`,
        },
        edit: {
          description: `ペルソナの属性を編集します。`,
          select_modal_title: `属性を選択`,
          select_label: `編集する属性`,
          select_description: `編集する属性を選択してください`,
          select_placeholder: `属性を選択...`,
          confirm_title: `属性を編集しますか？`,
          confirm_description: `次の属性を選択しました:
> {attribute}

**確認** を押すと編集モーダルを開きます。`,
          modal_title: `属性を編集`,
          attribute_input_label: `更新後の属性`,
          attribute_input_description: `選択した属性を新しいテキストに置き換えます。`,
          attribute_input_placeholder: `{bot}はマンゴーが好き`,
          no_changes_title: `変更はありません`,
          no_changes_description: `その属性は既にその内容に設定されています。`,
          duplicate_title: `重複した属性`,
          duplicate_description: `この属性 '{attribute}' は既に私の属性リストにあります。`,
          success_title: `属性を更新しました`,
          success_description: `属性を正常に更新しました: "{attribute}"`,
        },
        remove: {
          description: `ペルソナから属性を削除します。`,
        },
      },
      prompt: {
        description: `ペルソナのプロンプト指示を管理します。`,
        set: {
          description: `ペルソナプロンプトを設定します。`,
        },
        remove: {
          description: `ペルソナプロンプトを削除します。`,
        },
      },
      "sample-dialogue": {
        description: `私がどのように応答すべきかの例として、ユーザー/ボットの対話ペアを追加します。`,
        add: {
          description: `私がどのように応答すべきかの例として、ユーザー/ボットの対話ペアを追加します。`,
        },
        edit: {
          description: `サンプル対話ペアを編集します。`,
          select_modal_title: `サンプル対話を選択`,
          select_label: `編集する対話`,
          select_description: `編集する対話ペアを選択してください`,
          select_placeholder: `対話を選択...`,
          confirm_title: `サンプル対話を編集しますか？`,
          confirm_description: `次の対話ペアを選択しました:
**ユーザー:** {input}
**私:** {output}

**確認** を押すと編集モーダルを開きます。`,
          modal_title: `サンプル対話を編集`,
          user_input_label: `ユーザーのセリフ`,
          user_input_description: `ユーザー側の例文を更新します。`,
          user_input_placeholder: `好きな食べ物は何ですか？`,
          bot_input_label: `私の応答`,
          bot_input_description: `私の応答例を更新します。`,
          bot_input_placeholder: `わ、わたしはマンゴーが好きです…`,
          no_changes_title: `変更はありません`,
          no_changes_description: `そのサンプル対話ペアは既にその内容に設定されています。`,
          duplicate_title: `重複したサンプル対話`,
          duplicate_description: `そのサンプル対話ペアは既に存在します。`,
          success_title: `サンプル対話を更新しました`,
          success_description: `対話ペアを正常に更新しました: ユーザー: "{input}" -> ボット: "{output}"`,
        },
        remove: {
          description: `私の記憶からサンプルユーザー/ボットの対話ペアを削除します。`,
        },
      },
      name_conflict_title: `🔴 ペルソナ名の競合`,
      name_conflict_description: `**{name}** という名前のペルソナは既にこのサーバーに存在します。ペルソナ名はサーバー内で一意である必要があります。`,
      export: {
        description: `の人格を共有可能なPNGファイルとしてエクスポートする`,
        export_json_select_label: `JSONをエクスポート`,
        export_json_select_description: `任意：読み取り用JSONファイルとしてエクスポート`,
        persona_modal_title: `ペルソナを選択`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `エクスポートするペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        success_title: `🟢 ペルソナのエクスポートに成功しました`,
        success_description: `ペルソナ **{nickname}** がエクスポートされました！このPNGファイルを他の人と共有して、人格設定を広めましょう。`,
        success_description_json: `ペルソナ **{nickname}** が読み取り用JSONファイルとしてエクスポートされました。

**注意:** このJSONエクスポートは参照用のみで、インポートはできません。`,
        json_non_importable_note: `このJSONエクスポートは参照用のみで、インポートはできません。`,
        failed_title: `🔴 エクスポートに失敗しました`,
        avatar_failed_title: `🔴 アバターのダウンロードに失敗しました`,
        avatar_failed_description: `ペルソナアバターのダウンロードに失敗しました。後でもう一度お試しください。`,
        embed_failed_title: `🔴 PNG処理に失敗しました`,
        embed_failed_description: `PNGファイルへのメタデータの埋め込みに失敗しました。もう一度お試しください。`,
        error_no_server_data: `データベースにサーバーが見つかりません。まず \`/config setup\` を実行してください。`,
        error_no_preset_data: `ペルソナデータが見つかりません。まず /config setup を実行してください。`,
        error_validation_failed: `エクスポートデータ構造の検証に失敗しました`,
        error_export_failed: `ペルソナデータのエクスポートに失敗しました`,
      },
      import: {
        description: `PNGまたはJSONファイルからペルソナをインポートする`,
        file_description: `ペルソナデータを含むPNGまたはJSONファイル`,
        type_description: `メインペルソナまたはオルタペルソナとしてインポート`,
        triggers_description: `任意の追加トリガー（カンマ区切り: "," または "、"）`,
        memories_description: `このペルソナの記憶（ユーザー・サーバー）を引き継ぎますか？`,
        memories_choice_preserve: `はい（ユーザー/サーバー記憶を引き継ぐ）`,
        memories_choice_fork: `いいえ（ユーザー/サーバー記憶を新しく開始する）`,
        type_choice_main: `メインペルソナ（現在の人格を置き換え）`,
        type_choice_alter: `オルタペルソナ`,
        success_title: `🟢 ペルソナのインポートに成功しました`,
        success_description: `ペルソナ **{nickname}** が正常にインポートされました！
属性: {attribute_count}
サンプル対話: {dialogue_count}
トリガーワード: {trigger_word_count}`,
        success_confirmation: `メインペルソナ **{nickname}** が正常にインポートされました！詳細なインポート情報がチャンネルに投稿されました。`,
        nickname_update_success: `サーバーニックネームが更新されました。`,
        nickname_update_failed: `🟡 サーバーニックネームを更新できませんでした。Discordのレート制限が原因である可能性があります。手動で変更してください。`,
        avatar_update_success: `サーバーアバターが更新されました。`,
        avatar_update_skipped_no_image: `🟡 インポートしたファイルにはアバター画像が含まれていなかったため、現在のメインペルソナのアバターをそのまま維持しました。`,
        avatar_update_rate_limited: `🟡 Discordのレート制限によりサーバーアバターは更新されませんでした。手動で変更してください。`,
        avatar_update_failed: `🟡 サーバーアバターを更新できませんでした。Discordのレート制限が原因である可能性があります。手動で変更してください。`,
        alter_success_title: `🟢 オルタペルソナのインポートに成功しました`,
        alter_success_description: `オルタペルソナ **{nickname}** が正常にインポートされました！
固有トリガーワード: {trigger_count}
トリガー: {triggers}

これらのトリガーがメッセージに含まれると、このペルソナが応答します。`,
        alter_success_confirmation: `オルタペルソナ **{nickname}** が {trigger_count} 個の固有トリガーワードで正常にインポートされました！詳細なインポート情報がチャンネルに投稿されました。`,
        alter_avatar_fallback_main: `🟡 このインポートにはアバター画像が含まれていなかったため、このオルタはフォールバックとして **{nickname}** の現在のメインペルソナアバターを使用します。変更したい場合は \`/server avatar\` を使用できます。`,
        alter_avatar_warning: `⚠️ 上記のアバター画像埋め込みを削除しないでください。削除するとオルタペルソナのアバターが失われます。`,
        alter_dm_not_allowed_title: `🔴 DMではオルタペルソナは許可されていません`,
        alter_dm_not_allowed_description: `オルタペルソナはサーバーでのみインポートできます。ダイレクトメッセージではインポートできません。サーバーでこのコマンドを実行してください。`,
        alter_no_triggers_warning: `⚠️ このペルソナにはトリガーワードがありません。\`/server trigger add\`を使用してトリガーを追加するまで、メッセージに応答しません。`,
        alter_name_conflict_title: `🔴 ペルソナ名が既に存在します`,
        alter_name_conflict_description: `**{name}** という名前のペルソナは既にこのサーバーに存在します。各ペルソナには固有の名前が必要です。

インポートファイルを編集して別の名前を使用するか、\`/persona remove\`を使用して既存のペルソナを削除してください。`,
        alter_limit_title: `🔴 ペルソナ上限に達しました`,
        alter_limit_description: `このサーバーには既に {current} 個のペルソナがあります。上限は {max} 個です。\`/persona remove\` でオルタを削除してからインポートしてください。`,
        failed_title: `🔴 インポートに失敗しました`,
        failed_description: `ペルソナのインポートに失敗しました。ファイルを確認してもう一度お試しください。`,
        invalid_file_type_title: `🔴 無効なファイル形式`,
        invalid_file_type_description: `ペルソナデータを含む有効な.pngまたは.jsonファイルをアップロードしてください。`,
        file_too_large_title: `🔴 ファイルが大きすぎます`,
        file_too_large_description: `ファイルが大きすぎます。最大ファイルサイズは10MBです。`,
        download_failed_title: `🔴 ダウンロードに失敗しました`,
        download_failed_description: `添付ファイルのダウンロードに失敗しました。もう一度お試しください。`,
        invalid_png_title: `🔴 無効なPNGファイル`,
        invalid_png_description: `アップロードされたファイルは有効なPNG画像ではありません。`,
        no_metadata_title: `🔴 ペルソナデータが見つかりません`,
        no_metadata_description: `このファイルには対応しているペルソナデータが含まれていません。\`/persona export\`でエクスポートしたファイル、または対応しているSillyTavernキャラクターカードを使用してください。`,
        invalid_file_title: `🔴 無効なペルソナファイル`,
        invalid_file_description: `ペルソナファイル形式が無効または互換性がありません。`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `ペルソナをインポートするには**サーバー管理**権限が必要です。`,
        error_download_timeout: `ファイルのダウンロードがタイムアウトしました。もう一度お試しください。`,
        error_invalid_attribute: `無効な属性内容: {details}`,
        error_invalid_dialogue_in: `無効なサンプル対話(入力): {details}`,
        error_invalid_dialogue_out: `無効なサンプル対話(出力): {details}`,
        error_invalid_trigger_word: `無効なトリガーワード: {details}`,
        error_dialogue_mismatch: `サンプル対話配列の長さが一致しません`,
        error_invalid_config: `ペルソナデータに無効な設定フィールドがあります`,
        error_no_server_data: `データベースにサーバーが見つかりません。まず \`/config setup\` を実行してください。`,
        error_name_conflict: `**{name}** という名前のペルソナは既にこのサーバーに存在します。別の名前を使用してください。`,
        error_import_failed: `ペルソナデータのインポートに失敗しました`,
        error_not_json: `インポートしたファイルには有効なJSONデータが含まれている必要があります`,
        error_incompatible_version: `互換性のないペルソナバージョン。期待: {expected}、実際: {actual}`,
        error_invalid_format: `無効なペルソナファイル形式`,
        error_invalid_type: `無効なペルソナタイプ: {type}。"preset"が期待されます`,
        avatar_update_skipped_dm: `ペルソナは正常にインポートされましたが、アバターとニックネームの更新はダイレクトメッセージでは利用できません。`,
        refresh_reminder: `この会話で人格の更新を適用するには\`/tool refresh\`を実行してください`,
      },
      remove: {
        description: `サーバーからオルタペルソナを削除する`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `オルタペルソナを削除するには**サーバー管理**権限が必要です。`,
        modal_title: `オルタペルソナの削除`,
        select_label: `オルタペルソナ`,
        select_placeholder: `削除するオルタペルソナを選択...`,
        no_alters_error_title: `🟡 オルタペルソナがありません`,
        no_alters_error_description: `削除するオルタペルソナがありません。\`/persona import type:alter\`を使用してオルタペルソナをインポートしてください。`,
        success_title: `🟢 オルタペルソナを削除しました`,
        success_description: `オルタペルソナ **{nickname}** が正常に削除されました。`,
      },
      swap: {
        description: `メインペルソナとオルタペルソナを交換する`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `ペルソナを交換するには**サーバー管理**権限が必要です。`,
        modal_title: `メインペルソナの交換`,
        select_label: `オルタペルソナ`,
        select_placeholder: `メインに昇格させるオルタペルソナを選択...`,
        no_alters_error_title: `🟡 オルタペルソナがありません`,
        no_alters_error_description: `交換するオルタペルソナがありません。\`/persona import type:alter\`を使用してオルタペルソナをインポートしてください。`,
        success_title: `🟢 ペルソナの交換に成功しました`,
        success_description: `**{new_main}** が現在のメインペルソナになりました。
**{old_main}** がオルタペルソナになりました。`,
        nickname_update_success: `サーバーニックネームが更新されました。`,
        nickname_update_failed: `🟡 サーバーニックネームを更新できませんでした。Discordのレート制限が原因である可能性があります。手動で変更してください。`,
        avatar_update_success: `サーバーアバターが更新されました。`,
        avatar_update_rate_limited: `🟡 Discordのレート制限によりサーバーアバターは更新されませんでした。手動で変更してください。`,
        avatar_update_failed: `🟡 サーバーアバターを更新できませんでした。Discordのレート制限が原因である可能性があります。手動で変更してください。`,
        avatar_embed_warning: `⚠️ この埋め込みを削除しないでください。削除すると保存されたアバターURLが失われる可能性があります。`,
        avatar_stored_notice: `以前のメインペルソナのアバターが保存されました。`,
      },
      default: {
        description: `人格設定のペルソナを適用します`,
        type_description: `適用先タイプ（デフォルトまたはオルタ）`,
        type_choice_default: `デフォルトペルソナ`,
        type_choice_alter: `オルタペルソナ`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `人格プリセットを適用するには**サーバー管理**権限が必要です。`,
        modal_title: `人格プリセットの適用`,
        select_label: `人格プリセット`,
        select_description: `適用するプリセットを選択してください。これにより、現在の属性と対話が上書きされます。`,
        select_placeholder: `プリセットを選択...`,
        no_presets_title: `利用可能なプリセットがありません`,
        no_presets_description: `データベースに人格プリセットがありません。\`/support discord\`で報告してください。`,
        preset_not_found: `選択されたプリセットが見つかりませんでした。`,
        success_title: `プリセットが適用されました`,
        success_details_description: `プリセット **{preset_name}** をペルソナ **{nickname}** に適用しました！
属性: {attribute_count}
サンプル対話: {dialogue_count}
トリガーワード ({trigger_word_count}): {triggers}`,
        success_confirmation: `ペルソナ **{nickname}** にプリセットを適用しました。詳細情報をこのチャンネルに投稿しました。`,
        avatar_update_failed: `🟡️ Discord APIエラーによりサーバーアバターを更新できませんでしたが、ペルソナは正常に適用されました。`,
        avatar_update_skipped_dm: `プリセットは正常に適用されましたが、アバター更新はダイレクトメッセージでは利用できません`,
      },
      generate: {
        description: `AIによる人格生成（対応プロバイダーが必要）`,
        modal: {
          title: `AI人格生成`,
          character_name_label: `キャラクター名`,
          character_name_description: `名前をカンマ（"," または "、"）区切りで入力してください。すべてトリガーワードとして追加され、先頭の名前が表示名になります。`,
          character_name_placeholder: `例: 初音ミク, ミク, Hatsune Miku`,
          character_info_label: `キャラクター情報と話し方の例`,
          character_info_description: `キャラクターとその話し方を説明してください`,
          character_info_placeholder: `性格、背景、話し方、例示のフレーズなど`,
          web_search_label: `ウェブ検索を使用しますか？`,
          web_search_description: `キャラクター情報を検索(既存メディアのキャラクター用)`,
          web_search_placeholder: `はいまたはいいえを選択`,
          web_search_yes: `はい、キャラクター情報を検索します`,
          web_search_no: `いいえ、オリジナルキャラクターを作成します`,
          additional_inst_label: `追加の指示`,
          additional_inst_placeholder: `任意：その他の指示（例：「キャラクターの返答は短くしてください」）`,
          file_upload_label: `キャラクター画像 / カード (任意)`,
          file_upload_description: `画像、Tomoriプリセット、またはSillyTavernカードPNGをアップロードして生成・変換`,
        },
        field_character_name: `キャラクター名`,
        field_character_info: `キャラクター情報と話し方の例`,
        field_web_search: `ウェブ検索を使用しますか？`,
        field_additional_inst: `追加の指示`,
        wrong_provider_title: `🔴 互換性のないプロバイダー`,
        wrong_provider_description: `ペルソナ生成には対応プロバイダーが必要です。現在のプロバイダーは **{current_provider}** です。\`/config api-key set\`を使用してプロバイダーを切り替えてください。`,
        no_api_key_title: `🔴 APIキーがありません`,
        no_api_key_description: `APIキーが設定されていません。\`/config api-key set\`を使用してプロバイダーのAPIキーを設定してください。`,
        model_incompatible_title: `互換性のないモデル`,
        model_incompatible_description: `現在のモデル（**{model_name}**）は、ペルソナ生成に必要な**構造化出力**をサポートしていません。

**次のステップ:**
\`/config model text\`を使用して、構造化出力をサポートするモデル（例：「STRUCT」機能を持つモデル）に切り替えてください。`,
        image_vision_required_title: `🔴 画像ビジョンが必要`,
        image_vision_required_description: `画像がアップロードされましたが、現在のモデル（**{model_name}**）は**画像ビジョン**をサポートしておらず、ビジョンモデルも設定されていません。

**次のステップ:**
1. \`/config model vision\`を使用して専用ビジョンモデルを設定する、または
2. \`/config model text\`を使用してビジョン対応モデルに切り替える、または
3. 画像を削除して画像なしで再生成する`,
        vision_model_provider_unsupported_title: `🔴 ビジョンモデルのプロバイダー非対応`,
        vision_model_provider_unsupported_description: `ビジョンモデル（**{vision_model_name}**）はプロバイダー **{vision_provider}** に設定されていますが、このプロバイダーはペルソナプリセット生成に対応していません。

**次のステップ:**
1. \`/config model vision\`を使用して対応プロバイダー（Google、OpenRouter、DeepSeek、Z.ai、Custom、NVIDIA NIM）のビジョンモデルを設定する、または
2. \`/config model text\`を使用してビジョンとプリセット生成の両方に対応したプライマリモデルに切り替える`,
        web_search_tools_required_title: `🔴 ウェブ検索を利用できません`,
        web_search_tools_required_description: `ウェブ検索が選択されましたが、現在のモデル（**{model_name}**）は**ツール**に対応していません。

**次のステップ:**
1. \`/config model text\`を使用してツール対応モデルに切り替える、または
2. ウェブ検索なしで再生成する（質問されたら「いいえ」を選択）`,
        api_key_decrypt_failed_title: `🔴 APIキーエラー`,
        api_key_decrypt_failed_description: `APIキーの復号化に失敗しました。\`/config api-key set\`を使用して再設定してください。`,
        invalid_image_title: `🔴 無効な画像`,
        invalid_image_description: `有効な画像ファイル(PNG、JPG、JPEGなど)をアップロードしてください。`,
        error_file_too_large: `アバター画像は8MB以下である必要があります。`,
        error_download_timeout: `アバターのダウンロードがタイムアウトしました。もう一度お試しください。`,
        error_download_failed: `アバター画像のダウンロードに失敗しました。`,
        processing_title: `人格を生成しています...`,
        processing_description: `これには1～2分かかる場合があります。キャラクターを生成していますので、お待ちください...

これは予期しない結果が生成される場合があります。必要に応じて再生成できます。`,
        generation_failed_title: `🔴 生成に失敗しました`,
        generation_failed_description: `人格の生成に失敗しました：{error}

異なる入力で再度お試しいただくか、APIキーを確認してください。`,
        validation_failed_title: `🔴 検証に失敗しました`,
        validation_failed_description: `生成された人格データの検証に失敗しました。もう一度お試しください。`,
        image_processing_failed_title: `🔴 画像処理に失敗しました`,
        image_processing_failed_description: `アップロードされた画像の処理に失敗しました。別の画像をお試しください。`,
        avatar_fetch_failed_title: `🔴 アバターの取得に失敗しました`,
        avatar_fetch_failed_description: `エクスポート用のサーバーアバターの取得に失敗しました。代わりに画像をアップロードしてみてください。`,
        metadata_embed_failed_title: `🔴 エクスポートに失敗しました`,
        metadata_embed_failed_description: `画像に人格データを埋め込むことができませんでした。もう一度お試しください。`,
        success_title: `🟢 {character_name} の生成に成功しました！`,
        success_description: `**{character_name}** の人格を生成しました！
**属性プレビュー:**
{attribute_preview}
**サンプル対話:**
{dialogue_preview}`,
        success_next_steps_title: `次のステップ`,
        success_next_steps_description: `1. 添付されたPNGファイルをダウンロード
2. PNGファイルと共に\`/persona import\`を使用してこのキャラクターをインポート
3. 進行中の会話に新しい人格を適用するには\`/tool refresh\`を実行
4. (任意) 必要に応じて\`/server avatar\`でアバターを変更`,
        avatar_update_skipped_dm: `アバターとニックネームの更新はダイレクトメッセージでインポートできませんのでご注意ください。`,
      },
      create: {
        description: `シンプルな人格プリセットを手動で作成`,
        modal: {
          title: `ペルソナ作成`,
          character_name_label: `キャラクター名`,
          character_name_description: `名前をカンマ（"," または "、"）区切りで入力してください。すべてトリガーワードとして追加され、先頭の名前が表示名になります。`,
          character_name_placeholder: `例: 初音ミク, ミク, Hatsune Miku`,
          character_desc_label: `キャラクター説明`,
          character_desc_placeholder: `キャラクターを説明してください（性格、外見、背景など）`,
          example_user_label: `ユーザーメッセージの例`,
          example_user_description: `ヒント: インポート後に /persona sample-dialogue add で例を追加できます`,
          example_user_placeholder: `こんにちは、{bot}！`,
          example_bot_label: `ボット返信の例`,
          example_bot_placeholder: `こんにちは、{user}！お元気ですか？`,
          file_upload_label: `キャラクター画像 (任意)`,
          file_upload_description: `キャラクターエクスポート用の画像をアップロード`,
        },
        field_character_name: `キャラクター名`,
        field_character_desc: `キャラクター説明`,
        field_example_user: `ユーザーメッセージの例`,
        field_example_bot: `ボット返信の例`,
        invalid_image_title: `🔴 無効な画像`,
        invalid_image_description: `有効な画像ファイル(PNG、JPG、JPEGなど)をアップロードしてください。`,
        error_file_too_large: `アバター画像は8MB以下である必要があります。`,
        error_download_timeout: `アバターのダウンロードがタイムアウトしました。もう一度お試しください。`,
        error_download_failed: `アバター画像のダウンロードに失敗しました。`,
        desc_too_long_title: `説明が長すぎます`,
        desc_too_long_description: `キャラクターの説明が長すぎます（{current_length} 文字）。最大許容長は {max_allowed} 文字です。`,
        example_user_too_long_title: `ユーザーメッセージの例が長すぎます`,
        example_user_too_long_description: `ユーザーメッセージの例が長すぎます（{current_length} 文字）。最大許容長は {max_allowed} 文字です。`,
        example_bot_too_long_title: `ボット返信の例が長すぎます`,
        example_bot_too_long_description: `ボット返信の例が長すぎます（{current_length} 文字）。最大許容長は {max_allowed} 文字です。`,
        validation_failed_title: `🔴 検証に失敗しました`,
        validation_failed_description: `ペルソナデータの検証に失敗しました。もう一度お試しください。`,
        image_processing_failed_title: `🔴 画像処理に失敗しました`,
        image_processing_failed_description: `アップロードされた画像の処理に失敗しました。別の画像をお試しください。`,
        avatar_fetch_failed_title: `🔴 アバターの取得に失敗しました`,
        avatar_fetch_failed_description: `エクスポート用のサーバーアバターの取得に失敗しました。代わりに画像をアップロードしてみてください。`,
        metadata_embed_failed_title: `🔴 エクスポートに失敗しました`,
        metadata_embed_failed_description: `画像に人格データを埋め込むことができませんでした。もう一度お試しください。`,
        success_title: `🟢 {character_name} の作成に成功しました！`,
        success_description: `**{character_name}** のペルソナが作成されました！
**説明:**
{character_description}`,
        success_dialogue_title: `サンプル対話`,
        success_next_steps_title: `次のステップ`,
        success_next_steps_description: `1. 添付されたPNGファイルをダウンロード
2. PNGファイルと共に\`/persona import\`を使用してこのキャラクターをインポート
3. 進行中の会話に新しい人格を適用するには\`/tool refresh\`を実行
4. (任意) 必要に応じて\`/server avatar\`でアバターを変更`,
        avatar_update_skipped_dm: `アバターとニックネームの更新はダイレクトメッセージでは利用できませんのでご注意ください。`,
      },
    },
    help: {
      features: {
        description: `TomoriBotができることを表示`,
        title: `TomoriBotの機能（バージョン {version}）`,
        embed_description: `これが私の全機能です：`,
        vision_title: `ビジョン＆メディア`,
        vision_description: `- 画像、動画、スタンプ、絵文字を見て分析できます
- YouTubeリンクから動画を視聴できます
- 共有された埋め込み（ツイート、記事など）の内容を見ることができます`,
        search_title: `検索＆情報 `,
        search_description: `- 最新情報をウェブ検索できます
- 画像、動画、ニュース検索も可能です（\`/optional-key brave set\`経由）
- URLからコンテンツを取得して読むことができます`,
        personality_title: `パーソナリティ＆カスタマイズ`,
        personality_description: `- \`/config rename\`と\`/server avatar\`で名前とアバターを変更できます
- \`/persona\`で異なるペルソナに切り替えられます（\`/persona export\`でペルソナを共有・保存もできます！）
- アルターペルソナとして複数のキャラクターが同一サーバーで共存し、それぞれ独自のトリガーとウェブフックアバターを持てます
- \`/persona attribute add\`、\`/persona sample-dialogue add\`、\`/persona prompt set\`で行動やトーンを調整できます
- \`/config system-prompt\`でカスタムシステムプロンプトを設定し、行動をさらに形張ることができます
- 詳しくは\`/help customization\`をご覧ください`,
        memory_title: `記憶＆パーソナライゼーション`,
        memory_description: `- ユーザーやサーバーに関する事実を記憶し、会話を跨いで保持します
- 個人的な記憶は全サーバーで保持されます（他のサーバーでも私に話しかけてみて！）
- 最近の会話はSTM（短期記憶）として保持し、チャンネルやサーバーをまたいで文脈を把握します（クロスサーバー共有は\`/personal stm\`でオプトインできます）
- \`/personal nickname\`であなたを呼ぶ名前を変更できます
- \`/memory\` と \`/persona\` コマンドで手動で記憶やペルソナ情報を追加・削除できます
- \`/server initialize expressions\`で絵文字やステッカーを登録すると、より適切な場面で使えるようになります
- \`/personal privacy\`で完全に見えなくなるオプションが利用可能です
- 詳しくは\`/help memory\`をご覧ください`,
        time_title: `時間認識`,
        time_description: `- サーバーの現在時刻を認識しています（\`/config timezone\`経由）
- リマインダーを設定できます（何かを思い出させるように頼んでみて！）
- 繰り返しリマインダーもサポートされており、ペルソナ固有です`,
        alter_title: `アルターペルソナ`,
        alter_description: `- アルターペルソナを使って、一つのサーバーに複数のキャラクターが共存できます
- それぞれのアルターは独自のパーソナリティを持ち、特定のキーワードでトリガーされます
- アルターペルソナは異なるアバターのためにウェブフックを使用します
- 一つのメッセージで複数のアルターを同時にトリガーできます（\`/config persona-trigger-limit\`の上限まで）
- ウェブフックメッセージに返信すると、そのペルソナとして会話が続きます
- \`/persona import\`（アルターオプション）と\`/persona remove\`でアルターを管理できます`,
        expressions_title: `表情＆リアクション`,
        expressions_description: `- サーバーのカスタム絵文字を会話で自然に使えます（大文字小文字不問の \`:名前:\` 形式）
- 返信の一部としてスタンプを送れます
- 関連する絵文字でメッセージにリアクションできます
- \`/server initialize expressions\`で絵文字とスタンプを登録すると精度が向上します`,
        documents_title: `ドキュメント知識庫`,
        documents_description: `- \`/memory document add\`でテキスト、PDF、Markdownファイルをサーバー知識としてアップロードできます
- \`/memory history import\`でチャンネル履歴を検索可能な知識として抽出できます
- 質問に答える際に、私は関連するドキュメント内容を取得して参照します
- チャットで共有されたファイル添付（PDF、ソースコード、Markdown、JSON、YAMLなど）も直接読み取れます、読んでと頼むだけ！
- 埋め込みモデルが必要です（\`/config model embedding\`で設定）
- \`/memory document remove\`と\`/memory history remove\`で保存済みドキュメントを削除できます`,
        impersonation_title: `なりきり＆ツール`,
        impersonation_description: `- \`/bot impersonate\`で自分自身、ペルソナ、またはシステムメッセージとしてメッセージを送信できます
- \`/personal impersonate prompt\`でユーザーなりきり用の再利用プロンプトを設定できます
- \`/tools compact\`で会話履歴を要約したりロールプレイで圧縮できます
- \`/bot respond\`でボットから定型文や案内付きメッセージを送信できます`,
        imagegen_title: `画像生成`,
        imagegen_description: `- テキストプロンプトから画像を生成し、参照画像を編集することもできます
- Text2ImageとImage2Imageをカスタマイズタブルなアスペクト比で対応
- \`/generate image\`を使うか、画像を生成してほしいと頼むだけで動作します
- 参照画像としてメッセージの添付ファイル、ステッカー、絵文字、ユーザーアバターを使えます
- Google、OpenRouter、Z.ai、NVIDIA NIMプロバイダーで利用可能（\`/config model image\`で設定）`,
        videogen_title: `動画生成`,
        videogen_description: `- テキストプロンプトから短い動画を生成し、参照画像をアニメーション化することもできます
- Text2VideoとImage2Videoをカスタマイズ可能なアスペクト比で対応
- \`/generate video\`を使うか、動画を生成してほしいと頼むだけで動作します
- 参照画像としてメッセージの添付ファイルやユーザーアバターを使えます
- Google、OpenRouter、Z.aiプロバイダーで利用可能（\`/config model video\`で設定）`,
        footer: `すべての機能がすべてのAIプロバイダーで利用できるわけではありません。推奨：Google Gemini。私に直接何ができるか聞いてみることもできます！`,
      },
      setup: {
        description: `TomoriBotの初期設定方法を学ぶ`,
        title: `TomoriBotを始める`,
        embed_description: `サーバー（またはDM）でTomoriBotを設定する方法：`,
        step1_title: `ステップ1：APIキーを取得`,
        step1_description: `TomoriBotは複数のAIプロバイダーに対応しています。いずれかのAPIキーが必要です。
- {helpApikey}で取得方法を確認
  - **Google Gemini** — 汎用、無料枠あり、すべての機能を実行可能
  - **OpenRouter** — 多数のAIモデルに一箇所でアクセス
  - **NovelAI** — 無検閲なロールプレイとストーリーテリング特化
  - **DeepSeek** — コスト効率の高い推論モデル
  - **NVIDIA NIM** — NVIDIAホスト型モデル
  - **Anthropic** — Claudeモデル
  - **Vertex AI** — Google Cloudモデル
  - **Z.ai (Zhipu)** — 中国のAIモデル、コーディングプランあり ⚠️ *利用規約でコーディング/エージェントのシナリオのみに制限*
  - **Custom** — OpenAI互換エンドポイント（Ollama、vLLM、LiteLLMなど）
- このAPIキーを**他人と共有しないでください**
- Customエンドポイントはセットアップ後に{configApiKeySet}または{configProviderSwitch}でBearer認証トークンを追加可能`,
        step2_title: `ステップ2：セットアップコマンドを実行`,
        step2_description: `- {configSetup}を使用してAPIキーを安全に追加し、TomoriBotを初期化
- （推奨）{serverInitializeExpressions}を実行して、サーバーの絵文字/スタンプ表現を適切に使えるようにする
	- APIキーは暗号化されて安全に保存されます
	- 各サーバーには独自の設定があります`,
        step3_title: `ステップ3：チャットを始める！`,
        step3_description: `- メンションするか、私のメッセージに返信するだけでチャットできます
- {serverTrigger}でトリガー方法を変更できます
- 記憶システムで会話を記憶します（{configPermissions}で無効化できます！）
- {serverAutotrigger}で自動トリガーを設定し、メンションなしでチャットできます`,
        step4_title: `オプション：カスタマイズする`,
        step4_description: `- {persona}コマンドで私のパーソナリティを完全に変更（アルターペルソナも含む！）
- {server}、{personal}、{memory}、{config}コマンドで設定を調整
- {memory}で記憶やドキュメント、{persona}で振る舞いを調整できます
- ドキュメントアップロード、APIキーローテーション、検閲なしモードなどの高度な機能も探してみてください`,
        need_help_title: `ヘルプが必要ですか？`,
        need_help_description: `- {helpFeatures} - 私ができることを見る
- {helpMemory} - 記憶システムについて学ぶ
- {helpCustomization} - パーソナリティのカスタマイズについて学ぶ
- {supportServer} - 公式TomoriBotサポートサーバーに参加

TomoriBotをセットアップすることで、あなたとサーバーメンバーは\`/legal terms\`と\`/legal privacy\`の通知に同意したことになります`,
      },
      matrix: {
        description: `Matrixブリッジの設定方法と使い方を学ぶ`,
        title: `Matrixブリッジガイド`,
        embed_description: `MatrixルームをDiscordチャンネルにリンクする方法と、現在Matrix側で使える機能の案内です。`,
        bot_user_fallback: `設定されているMatrixボットアカウント`,
        setup_title: `セットアップ`,
        setup_description: `1. 暗号化されていないMatrixルームに {botUserId} を招待します。
2. そのルームの Internal Room ID を確認します。
3. ブリッジしたいDiscordチャンネルで {serverMatrixLink} を実行し、そのルームIDを貼り付けます。`,
        room_id_title: `ルームIDの確認方法`,
        room_id_description: `多くのMatrixクライアントでは Room Settings -> Advanced -> Internal Room ID から確認できます。
IDの形式は \`!abc:matrix.org\` のようになります。

ボットが招待を受け入れると、Matrixルームにも短い案内を送りますが、リンク完了には引き続きDiscord側で {serverMatrixLink} を実行する必要があります。`,
        usage_title: `Matrixからの使い方`,
        usage_description: `- ルームをリンクした後は、Matrixで普通に話しかければ使えます
- Matrixのメッセージはリンク先のDiscordチャンネルにWebhookとして転送されます
- TomoriBotの返信はMatrixルームにも戻ってきます
- Matrix側で使えるテキストコマンドは /kill と /refresh のみです`,
        limitations_title: `現在の制限`,
        limitations_description: `- MatrixからSlash Commandは使えません
- DM / DM経由のクールダウン通知は使えません
- Matrixユーザーのプロフィール画像はTomoriBotから見えません
- メッセージのピン留めはできません
- カスタム絵文字やMarkdownは安定して描画されません
- Embedはプレーンテキストとして転送されます
- Matrixユーザーの個人メモリは属性付きのサーバーメモリにフォールバックします`,
        troubleshooting_title: `注意事項`,
        troubleshooting_description: `- ボットが自動参加しない場合は {botUserId} を手動で招待し、必要なら {serverMatrixLink} を再実行してください
- Matrixの暗号化は後から無効化できないため、暗号化済みルームは使えず、新しい非暗号化ルームが必要です
- 上に書かれていない制限は基本的に動作する想定なので、動かない場合は {supportServer} で報告してください`,
      },
      data: {
        description: `データ管理とプライバシーについて学ぶ`,
        title: `データの管理`,
        embed_description: `データの管理方法と保存内容：`,
        export_title: `データのエクスポート`,
        export_description: `{memoryPersonalExport}、{memoryServerExport}、{personalConfigExport}、{serverConfigExport}を使ってデータをダウンロード：
- **ペルソナの個人メモリ / グローバル個人メモリ**
- **ペルソナのサーバーメモリ**
- **個人設定**
- **サーバー設定**
- **ペルソナ本体** は {personaExport} で別途エクスポート
- データはJSONファイルとしてDMに送信されます`,
        import_title: `データのインポート`,
        import_description: `{memoryPersonalImport}、{memoryServerImport}、{personalConfigImport}、{serverConfigImport}を使ってエクスポートしたデータを復元：
- エクスポートファイルの種類を自動判別します
- メモリ系ファイルは「ペルソナ」または「グローバル」適用先を選択します
- サーバー系インポートにはサーバー管理権限が必要です
- コマンド使用時にエクスポートしたファイルを添付するだけ`,
        delete_title: `データの削除`,
        delete_description: `{memoryPersonalRemove}、{memoryServerRemove}、{personalConfigRemove}、{serverConfigRemove}を使用してデータを完全に削除またはリセット：
- **ペルソナの個人メモリ** / **グローバル個人メモリ**
- **ペルソナのサーバーメモリ**
- **個人設定** / **サーバー設定のリセット**
- この操作は元に戻せません！`,
        privacy_title: `プライバシー通知`,
        privacy_description: `**保存するもの：**
- サーバー/個人の記憶
- 私の設定とペルソナ
- 私のサーバー設定
- 暗号化されたAPIキー

**保存しないもの：**
- Discordメッセージ
- チャット履歴

**選択したAIプロバイダーに送信されるもの：**
トリガーされるたびに、AIモデルが返信を形成するためのコンテキストとして、テキストチャンネルの**最新メッセージ**と**関連する記憶**を取得します。これらのトリガー以外でメッセージを積極的に監視したり閲覧したりすることはありません。

{personalPrivacy}コマンドで記憶機能をオプトアウトし、{configPermissions}コマンドで自己学習を無効化できます。`,
        footer: `選択したAIプロバイダー（Google、NovelAI、OpenRouter）は独自のプライバシーポリシーに従ってメッセージを処理します。プライバシーのため、個人情報を共有しないでください。詳細は\`/legal privacy\`と\`/legal terms\`をご覧ください`,
      },
      "api-key": {
        description: `AIプロバイダーのAPIキー設定方法を学ぶ`,
        provider_description: `AIプロバイダーを選択`,
        provider_choice_brave: `Brave Search`,
        provider_choice_google: `Google Gemini`,
        provider_choice_deepseek: `DeepSeek`,
        provider_choice_custom: `カスタムプロバイダー`,
        provider_choice_nvidia: `NVIDIA NIM`,
        provider_choice_novelai: `NovelAI`,
        provider_choice_openrouter: `OpenRouter`,
        brave_title: `Brave Search APIキーの設定`,
        brave_description: `Brave Searchはオプションで、検索機能を強化するだけです。これは私のAIを動かすものではありません（それはメインプロバイダーが担当します）。
- 画像、動画、ニュース検索を有効化
- インターネットからリアルタイム情報を提供
- 最新の質問に答える能力を強化`,
        brave_getting_key_title: `APIキーの取得：`,
        brave_getting_key_description: `1. [Brave Search API](https://brave.com/search/api/)にアクセス
2. 無料アカウントに登録
3. ダッシュボードの[APIキー](https://api-dashboard.search.brave.com/app/keys)セクションに移動
4. 新しいAPIキーを作成
5. {configBraveapiSet}コマンドでAPIキーをコピーして入力`,
        brave_important_title: `重要な注意事項：`,
        brave_important_description: `- これはメインAIプロバイダーとは別です
- Brave APIキーがなくても、組み込みウェブ検索で機能します
- Braveでは毎月5ドル分の無料クレジットが含まれますが、それを超えると課金される場合があります。無料枠だけ使いたい場合は、[Braveの使用量上限ダッシュボード](https://api-dashboard.search.brave.com/app/subscriptions/usage-limits)で使用量上限を5ドルに設定してください`,
        brave_footer: `メインAIプロバイダーの設定については、他の\`/help api-key\`オプションを確認してください`,
        google_title: `Google Gemini APIキーの設定`,
        google_description: `Google Geminiは強力なAIモデルを備えた無料および有料プランを提供します。
- 無料プランで十分な制限あり
- ビジョンやペルソナ生成などTomoriBotの全機能をサポート
- [Geminiプライバシーポリシー](https://ai.google.dev/gemini-api/terms)`,
        google_getting_key_title: `APIキーの取得：`,
        google_getting_key_description: `1. [Google AI Studio](https://aistudio.google.com/apikey)にアクセス
2. 右上の\`APIキーを作成\`をクリック（必要に応じて新しいプロジェクトを作成）
3. このAPIキーを{configSetup}または{configApikeySet}にコピー`,
        google_footer: `このプロバイダーを設定したら、{configModel}でデフォルトモデルを変更できます`,
        deepseek_title: `DeepSeek APIキーの設定`,
        deepseek_description: `DeepSeekは従量課金制のテキストプロバイダーです。
- [DeepSeek APIドキュメント](https://api-docs.deepseek.com/)`,
        deepseek_getting_key_title: `APIキーの取得：`,
        deepseek_getting_key_description: `1. [DeepSeek API Keys](https://platform.deepseek.com/api_keys)にアクセス
2. DeepSeekのプラットフォームアカウントにログイン、または新規作成
3. 新しいAPIキーを作成
4. 必要に応じて、使用前にDeepSeekプラットフォームアカウントへ残高を追加
5. このAPIキーを{configSetup}または{configApikeySet}にコピー`,
        deepseek_footer: `このプロバイダーを設定したら、{configModel}でデフォルトモデルを変更できます`,
        custom_title: `カスタムプロバイダーのセットアップ`,
        custom_description: `Ollama・vLLM・LiteLLM・OneAPI・KoboldCPPなど、任意のOpenAI互換エンドポイントに接続できます。

**エンドポイントURL**
カスタムプロバイダーを選択する際に、APIキーフィールドにベースURLを入力してください。
例: \`https://my-server.com/v1\`
\`/chat/completions\` は自動で付加されます。自分で追加しないでください。
本番環境では**HTTPS**かつ公開アクセス可能なURLが必要です（localhostやプライベートIPは不可）。

**モデル名**
URL入力後に表示される機能設定プロンプトで設定します。エンドポイントが期待する正確な名前を入力してください。例: Ollamaなら \`gemma3:latest\`、プロキシならそのモデルID。
リクエストの \`model\` フィールドとして送信されます。

**APIキー / Bearerトークン**
オプションです。セットアップ後に \`/config api-key set\` または \`/config provider switch\` でBearerトークンを保存できます。
設定した場合、各リクエストで \`Authorization: Bearer {token}\` として送信されます。
認証不要なエンドポイント（ローカルのOllamaなど）では設定不要です。`,
        nvidia_title: `NVIDIA NIM APIキーの設定`,
        nvidia_description: `NVIDIA NIMは、NVIDIA Build経由でホスト型のテキスト・埋め込み・画像APIを提供します。`,
        nvidia_getting_key_title: `APIキーの取得：`,
        nvidia_getting_key_description: `1. [NVIDIA Build](https://build.nvidia.com/)にアクセス
2. NVIDIA開発者アカウントでログイン、または新規作成
3. [API Keysページ](https://build.nvidia.com/settings/api-keys)でAPIキーを作成または管理
4. このAPIキーを{configSetup}または{configApikeySet}にコピー`,
        nvidia_important_title: `重要な注意事項：`,
        nvidia_important_description: `- テキストと埋め込みはNVIDIAのホスト型 \`integrate.api.nvidia.com\` を使用します
- ネイティブ画像生成はNVIDIAホストの \`ai.api.nvidia.com\` Stabilityエンドポイントを使用します`,
        nvidia_footer: `このプロバイダーを設定したら、{configModel}、{configModelEmbedding}、{configModelImage}でテキスト・埋め込み・画像モデルを変更できます`,
        provider_choice_zai: `Z.ai`,
        provider_choice_vertex: `Google Vertex AI`,
        provider_choice_elevenlabs: `ElevenLabs TTS`,
        zai_title: `Z.ai APIキーの設定`,
        zai_description: `Z.aiは、汎用APIと別個のCodingエンドポイントを通じてGLMファミリーへアクセスできます。

⚠️ **利用規約の更新：** Z.aiの利用規約が更新され、コーディング/エージェントのユースケースのみが許可されるようになりました。汎用エンドポイントをコーディング以外のチャットに使用する場合、自己責任となり規約に違反する可能性があります。`,
        zai_getting_key_title: `APIキーの取得：`,
        zai_getting_key_description: `1. [Z.aiプラットフォーム](https://z.ai)にアクセス
2. ログインまたはアカウントを作成
3. ダッシュボードでAPIキーに移動
4. 新しいAPIキーを作成
5. このAPIキーを{configSetup}または{configApikeySet}にコピー`,
        zai_important_title: `重要な注意事項：`,
        zai_important_description: `- 通常のチャット、推論、画像生成には汎用エンドポイントを使ってください
- 専用のCodingエンドポイントは別扱いで、コーディング特化ワークフロー向けです
- ⚠️ Z.aiの利用規約がコーディング/エージェントのシナリオのみに制限されました — 一般チャットでの使用は自己責任です`,
        zai_footer: `このプロバイダーを設定したら、{configModel}でデフォルトモデルを変更できます`,
        novelai_title: `NovelAI APIキーの設定`,
        novelai_description: `NovelAIはクリエイティブなストーリーテリングとロールプレイに焦点を当てたサブスクリプションベースのサービスです。
- 無制限の無検閲メッセージ
- 現在、テキスト生成のみをサポートしています（ビジョンやアシスタント機能はありません）。
- [NovelAI利用規約](https://novelai.net/terms)`,
        novelai_getting_key_title: `APIキーの取得：`,
        novelai_getting_key_description: `1. [NovelAI](https://novelai.net/stories)にアクセス
2. 左上の⚙️アイコンから設定に移動
3. \`アカウント\`に移動
4. \`永続的APIトークンを取得\`を探す（購読申し込みが必要です！）
5. このAPIキーを{configSetup}または{configApikeySet}にコピー`,
        novelai_footer: `このプロバイダーを設定したら、{configModel}でデフォルトモデルを変更できます`,
        openrouter_title: `OpenRouter APIキーの設定`,
        openrouter_description: `OpenRouterは従量課金制で複数のプロバイダーの様々なAIモデルへのアクセスを提供します。
 - 最新かつ最も強力なAIモデルへのアクセス（無料もあります）
 - 現在、TomoriBotの全機能をサポートしていません
 - [OpenRouter利用規約](https://openrouter.ai/terms)`,
        openrouter_getting_key_title: `APIキーの取得：`,
        openrouter_getting_key_description: `1. [OpenRouter](https://openrouter.ai/settings/keys)にアクセス
2. \`APIキーを作成\`をクリック
3. このAPIキーを{configSetup}または{configApikeySet}にコピー`,
        openrouter_important_title: `重要な注意事項：`,
        openrouter_important_description: `- **無料モデルは厳格なレート制限があります**。通常は有料モデルの方が安定します
- モデルを選ぶ前に**必ず料金を確認**してください
- OpenRouterアカウント側の設定もそのまま適用されます
- 一覧にないモデルが必要なら{supportServer}で提案してください`,
        openrouter_footer: `このプロバイダーを設定したら、{configModel}でデフォルトモデルを変更できます`,
        vertex_title: `Google Vertex AIの設定`,
        vertex_description: `Google Vertex AIは、Google Cloudを通じてGeminiモデルへのエンタープライズグレードのアクセスを提供します。
- 認証にApplication Default Credentials（ADC）を使用 — APIキーの管理が不要
- チャット、ツール呼び出し、ストリーミング、構造化出力、圧縮、埋め込み、プリセット生成に対応
- BotがGCP IDで実行されるセルフホストまたは信頼できる環境に最適
- [Vertex AIドキュメント](https://cloud.google.com/vertex-ai/docs)`,
        vertex_getting_key_title: `設定手順：`,
        vertex_getting_key_description: `1. Vertex AI APIが有効なGoogle Cloudプロジェクトを用意
2. ホストマシンでApplication Default Credentialsを設定：
   - **サービスアカウント**：Vertex AIアクセス権を持つサービスアカウントをVM/コンテナにアタッチ
   - **ローカル開発**：\`gcloud auth application-default login\`を実行
   - **環境変数**：\`GOOGLE_APPLICATION_CREDENTIALS\`にサービスアカウントキーファイルのパスを設定
3. {configSetup}または{configApikeySet}で\`{project_id}::{location}\`の形式で設定
   - 例：\`my-gcp-project::us-central1\``,
        vertex_important_title: `重要な注意事項：`,
        vertex_important_description: `- 保存される値は**設定情報**（プロジェクト＋ロケーション）であり、認証情報ではありません
- すべてのVertexリクエストはホストのADC IDを使用 — サーバーごとの認証情報の分離はありません
- このプロバイダーはセルフホストまたは信頼できるプライベート環境を想定しています
- チャット、ツール呼び出し、ストリーミング、構造化出力、圧縮、埋め込み、プリセット生成に対応`,
        vertex_footer: `このプロバイダーを設定したら、{configModel}でデフォルトモデルを変更できます`,
      },
      elevenlabs: {
        description: `ElevenLabs音声合成の設定方法を学ぶ`,
        title: `ElevenLabs TTSの設定`,
        getting_key_title: `APIキーの取得：`,
        getting_key_description: `1. [ElevenLabs](https://elevenlabs.io/app/settings/api-keys)にアクセス
2. アカウントにサインインまたは新規登録
3. 新しいAPIキーを作成
4. {optionalkeyElevenlabsSet}を使用してAPIキーを入力`,
        choosing_voice_title: `ボイスの選択：`,
        choosing_voice_description: `APIキーを設定したら、使用するボイスを選択できます。
 - {configVoiceElevenlabs}を使って利用可能なボイスを参照・選択
 - [Voice Library](https://elevenlabs.io/app/voice-library) からボイスを追加でき、自分の声のクローンも作成できます`,
        free_voices_title: `プリメイド音声（無料プラン対応）：`,
        free_voices_description: `プリメイド音声は無料プランでも利用できます。一覧は [ElevenLabs Premade Voices](https://elevenlabs-sdk.mintlify.app/voices/premade-voices) で確認し、{configVoiceElevenlabs} で各ペルソナに割り当てましょう。`,
        important_notes_title: `重要な注意点：`,
        important_notes_description: `- 音声メッセージを生成・読み上げると文字数が消費されます
- 無料ティアには月間制限があります。使用量はElevenLabsダッシュボードで確認してください
- APIキーは{optionalkeyElevenlabsRemove}でいつでも削除できます`,
        footer: `APIキーは{optionalkeyElevenlabsRemove}でいつでも削除できます`,
      },
      memory: {
        description: `TomoriBotの記憶システムについて学ぶ`,
        title: `記憶の仕組み`,
        embed_description: `会話を跨いでユーザーやサーバーに関する事実や情報を記憶する永続的な記憶システムがあります！これは**私が知っていること**（事実、コンテキスト、情報）についてです。**私がどう振る舞うか**（パーソナリティ、トーン、設定）については、代わりに{helpCustomization}をご覧ください！`,
        teaching_title: `物事を教える`,
        teaching_description: `{memoryPersonalAdd}と{memoryServerAdd}を使用して**事実と情報**を記憶させます：
- **個人的な記憶**（{memoryPersonalAdd}）：個々のユーザーに関する事実
  - 例：「Alexは猫が好き」、「ダークモードを好む」、「ピーナッツアレルギー」
- **サーバーの記憶**（{memoryServerAdd}）：サーバー全体に関連する情報
  - 例：「ゲームナイトは毎週金曜日午後8時」、「NSFWの投稿禁止」、「お知らせには#generalを使用」`,
        forgetting_title: `忘れること`,
        forgetting_description: `{memoryPersonalRemove}と{memoryServerRemove}を使用して記憶を削除：
- {memoryPersonalRemove} - ユーザーに関する個人的な事実を削除
- {memoryServerRemove} - サーバー全体の情報を削除`,
        how_it_works_title: `仕組み：`,
        how_it_works_description: `- **個人的な記憶**は全サーバーであなた専用に紐付けられ、あなたが積極的に参加している会話で返信する際にのみ記憶します
- **サーバーの記憶**はサーバー内にのみ留まり、サーバー内の会話で返信する際に常に記憶します
- 記憶は対応する\`/memory ... remove\`コマンドを使用するまで保持されます`,
        tips_title: `記憶のヒント：`,
        tips_description: `- 好み、ニックネーム、重要な事実を教えてください
- サーバーの記憶には共有情報、内輪ネタ、サーバー文化を使用
- {memoryPersonalExport}、{memoryServerExport}、または{status}で定期的に記憶を確認
- 最良の結果を得るために記憶を簡潔明瞭に保つ

**プライバシー:** データ処理の詳細は\`/legal privacy\`をご覧ください`,
        documents_title: `ドキュメント知識庫`,
        documents_description: `サーバー管理者は参照用のドキュメントをアップロードできます：
- \`/memory document add\`でテキスト、PDF、Markdownファイルをアップロード
- \`/memory history import\`でチャンネル履歴をドキュメント記憶として抽出
- ドキュメントは検索可能な埋め込みとして分割して保存されます
- 会話に基づいて私は自動的に関連する内容を取得します
- \`/memory document remove\`または\`/memory history remove\`で保存済みドキュメントを削除
- \`/config model embedding\`で埋め込みモデルの設定が必要`,
        shortterm_title: `短期記憶`,
        shortterm_description: `永続的な記憶に加え、最近の会話はSTM（短期記憶）として保持しています：
- 最近のメッセージはチャンネルごとにキャッシュされ、各ペルソナは同じサーバー内の他チャンネルにも最新のSTMを持ち越します
- 古い会話を自動的に要約し、文脈を効率的に保つことができます
- **クロスサーバー共有**はオプトイン制です：{personalStm}の\`crossserver\`オプションを使うと、あなた自身の他サーバーでの会話も参照できるようになります
- {personalStmClear}でユーザー固有のSTMをすべて削除できます
- STMは時間とともに自動的に期限切れになります`,
      },
      customization: {
        description: `TomoriBotのパーソナリティと動作をカスタマイズする方法を学ぶ`,
        embed1_title: `TomoriBotのカスタマイズ`,
        embed1_description: `TomoriBotは高度にカスタマイズ可能です！私を本当にあなたのものにするために設定できるすべてがここにあります。これは**私がどう振る舞うか**（パーソナリティ、トーン、設定）についてです。**私が記憶していること**（事実、記憶）については、代わりに{helpMemory}をご覧ください！`,
        embed1_personas_title: `パーソナリティペルソナ`,
        embed1_personas_description: `私の核となるパーソナリティと動作を制御：

**ペルソナコマンド：**
- {personaCreate} - ゼロからカスタムパーソナリティを作成
- {personaGenerate} - 説明と画像に基づいてAIがパーソナリティを生成（構造化出力に対応したプロバイダーが必要。TomoriプリセットやSillyTavernカードをアップロードして既存キャラクターを変換することも可能）
- {personaDefault} - デフォルトのパーソナリティに切り替え
- {personaExport} - ペルソナを共有またはバックアップ用にエクスポート
- {personaImport} - ファイルからペルソナをインポート（独自のトリガーとウェブフックアバターを持つアルターペルソナとしてインポートも対応）
- {personaRemove} - アルターペルソナを削除
- {personaAttributeAdd} / {personaSampleDialogueAdd} - 話し方や行動を教える
- {serverAvatar} - プロフィール画像を変更`,
        embed1_what_personas_include_title: `ペルソナに含まれるもの：`,
        embed1_what_personas_include_description: `- パーソナリティ属性（特性、特徴、癖）
- サンプル対話（話し方を教える会話例）
- そのパーソナリティ用のカスタムサーバーアバター
- 動作とトーンの設定
- アルターペルソナ：独自のトリガー、ウェブフックアバター、パーソナリティを持つ別キャラクター`,
        embed1_footer: `次：教えるコマンド`,
        embed2_title: `教えるコマンド `,
        embed2_description: `## ペルソナ学習コマンド（\`/persona\`）
パーソナリティと知識を微調整：

**パーソナリティの形成：**
- {personaAttributeAdd} - パーソナリティの特性を追加（例：「フレンドリー」、「皮肉っぽい」、「フォーマル」）
- {personaSampleDialogueAdd} - 話し方を形作る会話例を追加
- {configRename} - 自分を何と呼ぶべきかを設定

**サンプル対話の書き方：**
例で\`{user}\`と\`{bot}\`のプレースホルダーを使用：
- \`{user}\` = 実際のユーザーの名前/ニックネームに置き換えられます
- \`{bot}\` = 私の現在の名前に置き換えられます

**例：**
\`\`\`
ユーザーメッセージ：{user}：やあ、元気？
ボットの応答：{bot}：よぉ{user}！超元気だぜ、わかるだろ？
\`\`\`

**優れたサンプル対話のヒント：**
- 自然で会話的なやり取りを書く
- 表現したいパーソナリティの特性を含める
- 望むトーンを示す
- より良く学習できるように多様性を追加
- \`/persona export\`で共有する際にみんなに使えるようプレースホルダーを使用`,
        embed2_footer: `次：設定`,
        embed3_title: `設定＆管理`,
        embed3_description: `## 削除コマンド（\`/persona\`）
パーソナリティのカスタマイズを削除：

- {personaAttributeRemove} - 特定のパーソナリティ属性を削除
- {personaSampleDialogueRemove} - サンプル対話の例を削除

---

## サーバー設定（\`/server\`）
サーバー全体の設定と動作：

**学習＆プライバシー：**
- {serverMemberpermissions} - 誰が私に物事を教えられるかを制御
- {serverBlacklist} - 特定のユーザーから学習したり記憶を使用するのを防ぐ

**自動トリガー動作：**
- {serverAutotriggerChannels} - メンションなしで応答するチャンネルを設定
- {serverAutotriggerThreshold} - 自動応答のメッセージ閾値を設定

**トリガー＆外観：**
- {serverTriggerAdd} - 反応するカスタムトリガーワードを追加（アルターペルソナにも対応しています）
- {serverTriggerRemove} - トリガーワードを削除
- {serverAvatar} - このサーバー用のカスタムプロフィール画像を設定

**チャンネルホワイトリスト＆クールダウン：**
- {configCooldown} - 私の応答間のグローバルクールダウンを設定
- {serverWhitelistChannel} - チャンネルをホワイトリストに追加（ホワイトリストされたチャンネルのみが私をトリガーできます）
- {serverWhitelistPersona} - 特定チャンネルでトリガーできるペルソナを制限
- {serverWhitelistRole} - ロールホワイトリストにロールを追加/削除
- {serverWhitelistRemove} - ホワイトリスト項目を削除
- ホワイトリストされたチャンネルは、チャンネル固有の上書きを設定しない限りグローバルクールダウンを継承します

**ドキュメント：**
- {memoryDocumentAdd} - 参照用のドキュメントをアップロード
- {memoryDocumentRemove} - アップロードされたドキュメントを削除`,
        embed3_footer: `次：ボット設定`,
        embed4_title: `詳細設定`,
        embed4_description: `## ボット設定（\`/config\`）
個人的なボット設定：

**AI設定：**
- {configModel} - 使用するAIモデルを選択
- {configTemperature} - 創造性/ランダム性を調整。高いほど応答がより多様に（1.0-2.0）
- {configHumanizer} - 応答の人間らしさを変更

**画像生成：**
- {generateImage} - プロンプトから画像を生成し、参照画像を編集する
- {configModelImage} - 画像生成モデルを選択（Text2ImageとImage2Image対応）

**システムプロンプト：**
- {configPromptChange} - カスタムシステム指示を追加（最大16000文字）
- {configPromptPreset} - プリセットシステムプロンプトを選択
- {configPromptClear} - デフォルトシステムプロンプトにリセット

**APIキー：**
- {configApikeySet} - AIプロバイダーのAPIキーを設定
- {configApikeyDelete} - APIキーを削除
- {configApikeyRotation} - 自動フェイルオーバーとロード分散用のバックアップAPIキーを管理
- {configBraveapiSet} - Brave Search APIキーを設定（オプション）
- {configBraveapiDelete} - Brave Search APIキーを削除

**パーソナライゼーション：**
- {configRename} - 自分を何と呼ぶかを変更
- {configTimezone} - 時間認識応答とリマインダー用のタイムゾーンを設定
- {configPermissions} - 機能のオン/オフを切り替え（画像生成を含む）
- {configUncensors} - 検閲なし出力オプションを設定
- {personalPrivacy} - 私への視認性を制御（完全に見えなくなるオプション利用可能）
- {serverInitializeExpressions} - サーバーの絵文字とステッカーの見た目を登録し、適切な場面で使えるようにする

**ドキュメント知識庫：**
- {configModelEmbedding} - ドキュメントアップロードとRAG用の埋め込みモデルを設定`,
        embed4_footer: `他に質問があれば、\`/support discord\`でサポートサーバーに参加してください`,
        embed5_title: `プロのヒント`,
        embed5_description: `- ペルソナ（デフォルトまたは生成）を基盤として始める
- 素早くパーソナリティを調整するには\`/persona attribute add\`を使用
- サンプル対話では、属性や特性も示す例を使用すると効果的：
\`\`\`
ユーザーメッセージ：{user}：お気に入りの趣味は？
ボットの応答：{bot}：ふふ〜小さなぬいぐるみに小さな服を編むのが好きです〜♥
\`\`\`
- チャットして変更をテストし、しっくりくるまで繰り返す
- ペルソナをエクスポートしてバックアップするか、他のサーバーと共有！`,
      },
      updates: {
        description: `TomoriBotの最新リリース情報を表示`,
        title: `TomoriBot {version} リリース！`,
        no_notes: `このバージョンのリリースノートはありません。`,
        footer: `更新情報が古い可能性があります。最新のリリースと更新は \`/support discord\` を確認してください。`,
        fetch_error_title: `最新リリース情報の取得に失敗`,
        fetch_error_description: `GitHubから最新リリース情報を取得できませんでした。しばらくお待ちください。または、[GitHubリリース](https://github.com/Bredrumb/TomoriBot/releases)ページを直接確認してください。`,
      },
      mcp: {
        description: `MCPツールサーバーの追加と管理方法を学ぶ`,
        title: `MCPサーバーセットアップガイド`,
        description_text: `MCP（Model Context Protocol）サーバーは、外部ツールでTomoriの機能を拡張します。始め方を説明します。`,
        online_title: `オンラインMCPの追加`,
        online_description: `HTTPSエンドポイントを持つ公開MCPサーバーであれば、どれでも追加できます。Smithery.aiはその一例に過ぎません。

**Smithery.aiを使う場合：**
**1.** [smithery.ai](https://smithery.ai) にアクセスし、アカウントを作成してプロフィールからAPIキーを生成します。
**2.** カタログを閲覧し、追加したいMCPを開きます。ページに表示されている**接続URL**をコピーします（例：\`https://youtube.run.tools\`）。
**3.** {configMcpAdd} を実行し、**URL**フィールドに接続URLを、**認証トークン**フィールドにSmithery APIキーを貼り付けます。

**他のソースを使う場合：**
認証が不要なMCPサーバーの場合は、**認証トークン**フィールドを空白のままにしてください。サーバーによっては別の認証形式を使用する場合があります。詳細はそのサーバーのドキュメントを確認してください。

認証トークンは保存後に暗号化され、平文で表示されることはありません。`,
        local_title: `ローカルMCPの追加（自己ホスト限定）`,
        local_description: `ローカルMCPサーバーは、**自己ホストのTomoriBotインスタンスでのみ対応しています**。公式ホスト版のbotはセキュリティのためHTTPSが必要で、ローカル/プライベートアドレスはブロックされます。

自己ホストの場合は、ローカルサーバーのURLを指定してください（例：\`http://localhost:3000/sse\`）。ローカルサーバーには認証トークンは不要です。`,
        removing_title: `MCPサーバーの削除`,
        removing_description: `{configMcpRemove} を使えば、いつでもサーバーの登録を解除できます。削除すると即座に接続が切断され、新しいサーバーのスロットが解放されます。`,
        security_title: `セキュリティに関する警告`,
        security_description: `**信頼できるMCPサーバーのみ追加してください。**

悪意のあるMCPサーバーは以下のことが可能です：
- **プロンプトインジェクション** — Tomoriへ隠し指示を送り、動作を操作する
- **データ漏洩** — ツールに渡されたデータ（メッセージやファイル内容など）を外部へ送信する
- **有害または虚偽の結果** を返し、Tomoriがそれをサーバーに中継する

MCPサーバーはブラウザ拡張機能やサードパーティアプリと同様の注意を持って扱ってください。不安な場合は追加しないでください。`,
        footer: `Smithery.aiはサードパーティのサービスであり、TomoriBotとは無関係です。追加前に必ずMCPの提供ツールを確認してください。`,
      },
    },
    legal: {
      privacy: {
        description: `TomoriBotのプライバシーポリシーを表示`,
        title: `プライバシーポリシー`,
        description_text: `TomoriBotのプライバシーポリシーを表示して、データの取り扱いについて理解してください。これは公式ホスト版インスタンスに適用されます。セルフホスト版インスタンスは独自のデータ処理を制御します。`,
        link_title: `完全なプライバシーポリシー`,
      },
      terms: {
        description: `TomoriBotの利用規約を表示`,
        title: `利用規約`,
        description_text: `TomoriBotの利用規約を表示して、ボットの使用に関するルールとガイドラインを理解してください。これは公式ホスト版インスタンスに適用されます。セルフホスト版インスタンスはAGPLv3ライセンスに準拠します。`,
        link_title: `完全な利用規約`,
      },
      license: {
        description: `TomoriBotのオープンソースライセンスを表示`,
        title: `オープンソースライセンス`,
        description_text: `TomoriBotはGNU Affero General Public License v3.0（AGPLv3）の下でライセンスされたオープンソースソフトウェアです。このライセンスにより、コードを自由に使用、変更、配布できますが、公開ホストされたインスタンスへの変更もオープンソース化する必要があります。`,
        link_title: `完全なAGPLv3ライセンス`,
      },
    },
    novelai: {
      "character-reference": {
        description: `自分またはペルソナ用のNovelAIキャラクター参照画像を保存またはクリアします。`,
        target_description: `自分のプロフィールかサーバーのペルソナかを選択します。`,
        image_description: `保存する参照画像。空欄で現在の画像をクリアします。`,
        persona_select_title: `ペルソナを選択`,
        invalid_image_title: `無効な画像`,
        invalid_image_description: `キャラクター参照画像には画像添付ファイルを指定してください。`,
        download_failed_title: `ダウンロードに失敗しました`,
        download_failed_description: `選択した画像添付のダウンロードに失敗しました。もう一度お試しください。`,
        conversion_failed_title: `画像変換に失敗しました`,
        conversion_failed_description: `保存用にその画像をPNGへ変換できませんでした。別の画像をお試しください。`,
        success_title: `キャラクター参照画像を更新しました`,
        success_me_description: `あなたのNovelAIキャラクター参照画像を更新しました。`,
        success_persona_description: `**{persona_name}**のNovelAIキャラクター参照画像を更新しました。`,
        cleared_title: `キャラクター参照画像をクリアしました`,
        cleared_me_description: `あなたのNovelAIキャラクター参照画像をクリアしました。`,
        cleared_persona_description: `**{persona_name}**のNovelAIキャラクター参照画像をクリアしました。`,
      },
      tags: {
        style: {
          description: `このサーバー全体で使うNovelAIスタイルタグを設定します。`,
          modal_title: `スタイルタグ`,
          tags_input_label: `スタイルタグ`,
          tags_input_description: `このサーバーのすべてのNovelAI画像プロンプトの先頭に付くカンマ区切りタグです。空欄で全スタイルタグをクリアします。`,
          tags_input_placeholder: `8k, absurdres, watercolor, soft lighting`,
          no_tags_title: `タグが未入力です`,
          no_tags_description: `少なくとも1つのスタイルタグを入力してください。`,
          too_many_tags_title: `タグが多すぎます`,
          too_many_tags_description: `このサーバーには最大{max_tags}個までスタイルタグを設定できます。`,
          tag_too_long_title: `タグが長すぎます`,
          tag_too_long_description: `各スタイルタグは{max_length}文字以下にしてください。`,
          success_title: `スタイルタグを更新しました`,
          success_description: `サーバー全体のスタイルタグを更新しました：
\`\`\`
{tag_list}
\`\`\``,
          cleared_title: `スタイルタグを初期値に戻しました`,
          cleared_description: `サーバー全体のスタイルタグを初期値に戻しました：
\`\`\`
{tag_list}
\`\`\``,
        },
        negative: {
          description: `このサーバー全体で使うNovelAIネガティブタグを設定します。`,
          modal_title: `ネガティブタグ`,
          tags_input_label: `ネガティブタグ`,
          tags_input_description: `このサーバーのNovelAI画像生成に使うカンマ区切りのネガティブタグです。空欄でサーバー上書きをクリアし、フォールバックのネガティブプロンプトに戻します。`,
          tags_input_placeholder: `lowres, blurry, bad anatomy, watermark`,
          no_tags_title: `タグが未入力です`,
          no_tags_description: `少なくとも1つのネガティブタグを入力してください。`,
          too_many_tags_title: `タグが多すぎます`,
          too_many_tags_description: `このサーバーには最大{max_tags}個までネガティブタグを設定できます。`,
          tag_too_long_title: `タグが長すぎます`,
          tag_too_long_description: `各ネガティブタグは{max_length}文字以下にしてください。`,
          success_title: `ネガティブタグを更新しました`,
          success_description: `サーバー全体のネガティブタグを更新しました：
\`\`\`
{tag_list}
\`\`\``,
          cleared_title: `ネガティブタグを初期値に戻しました`,
          cleared_description: `サーバー全体のネガティブタグを初期値に戻しました：
\`\`\`
{tag_list}
\`\`\``,
        },
        me: {
          description: `自分用のNovelAIキャラクタータグを設定します。`,
          modal_title: `自分のキャラクタータグ`,
          tags_input_label: `キャラクタータグ`,
          tags_input_description: `あなたのNovelAIプロフィール用のカンマ区切り画像ボードスタイルタグです。空欄でクリアします。`,
          tags_input_placeholder: `1girl, short hair, red eyes, school uniform`,
          no_tags_title: `タグが未入力です`,
          no_tags_description: `少なくとも1つのキャラクタータグを入力してください。`,
          too_many_tags_title: `タグが多すぎます`,
          too_many_tags_description: `個人キャラクタータグは最大{max_tags}個まで設定できます。`,
          tag_too_long_title: `タグが長すぎます`,
          tag_too_long_description: `各キャラクタータグは{max_length}文字以下にしてください。`,
          success_title: `キャラクタータグを更新しました`,
          success_description: `あなたのNovelAIキャラクタータグを更新しました：
\`\`\`
{tag_list}
\`\`\``,
          cleared_title: `キャラクタータグをクリアしました`,
          cleared_description: `あなたのNovelAIキャラクタータグをすべてクリアしました。`,
        },
        character: {
          description: `ペルソナプロフィール用のNovelAIキャラクタータグを設定します。`,
          modal_title: `キャラクタータグ`,
          persona_select_label: `ペルソナ`,
          persona_select_description: `キャラクタータグを設定するペルソナを選択してください。`,
          persona_select_placeholder: `ペルソナを選択...`,
          tags_input_label: `キャラクタータグ`,
          tags_input_description: `カンマ区切りの画像ボードスタイルのタグ（例：1girl, short hair, red eyes）。大文字小文字を区別します。`,
          tags_input_placeholder: `1girl, short hair, red eyes, school uniform`,
          no_tags_title: `タグが未入力です`,
          no_tags_description: `少なくとも1つのキャラクタータグを入力してください。`,
          too_many_tags_title: `タグが多すぎます`,
          too_many_tags_description: `1ペルソナあたり最大{max_tags}タグまで設定できます。`,
          tag_too_long_title: `タグが長すぎます`,
          tag_too_long_description: `各タグは{max_length}文字以下にしてください。`,
          success_title: `キャラクタータグを更新しました`,
          success_description: `**{persona_name}**のキャラクタータグを更新しました：
\`\`\`
{tag_list}
\`\`\``,
          cleared_title: `キャラクタータグをクリアしました`,
          cleared_description: `**{persona_name}**のキャラクタータグをすべてクリアしました。`,
        },
      },
      preset: {
        text: {
          description: `このサーバーのテキスト生成設定にNovelAIサンプリングプリセットを適用します。`,
          not_novelai_title: `NovelAIプロバイダーが必要です`,
          not_novelai_description: `このコマンドはAIプロバイダーがNovelAIに設定されている場合にのみ使用できます。\`/config api-key set\` でプロバイダーを切り替えてください。`,
          not_kayra_erato_title: `KayraまたはEratoが必要です`,
          not_kayra_erato_description: `サンプリングプリセットは **kayra-v1** および **llama-3-erato-v1** モデルのみで利用可能です。\`/config model text\` でモデルを切り替えてください。`,
          modal_title: `サンプリングプリセットを選択`,
          select_label: `サンプリングプリセット`,
          select_description: `テキスト生成に適用するプリセットを選択してください。`,
          select_placeholder: `サンプリングプリセットを選択...`,
          success_title: `プリセットを適用しました`,
          success_description: `サンプリングプリセット **{preset_name}** を適用しました。温度、トップK、トップP、ミンPがサーバー設定に反映されました。`,
        },
      },
      image: {
        description: `このサーバーのNovelAI画像生成モデルとパラメータ上書きを管理します。`,
        generate: {
          description: `画像掲示板タグ形式のプロンプトと任意のキャラクター参照画像でNovelAI画像を生成します。`,
          modal_title: `NovelAI画像生成`,
          prompt_label: `プロンプトタグ`,
          prompt_modal_description: `メインシーン用の画像掲示板タグです。`,
          prompt_placeholder: `例: 1girl, solo, cafe, window light, detailed eyes`,
          negative_tags_label: `追加ネガティブタグ`,
          negative_tags_modal_description: `今回の生成だけに追加する任意のネガティブタグです。`,
          negative_tags_placeholder: `例: blurry, text, watermark, extra fingers`,
          orientation_label: `向き`,
          orientation_modal_description: `画像の向きを選択します。`,
          orientation_choice_portrait: `縦長`,
          orientation_choice_landscape: `横長`,
          orientation_choice_square: `正方形`,
          character_reference_label: `キャラクター参照画像`,
          character_reference_modal_description: `単一キャラクター用の任意の参照画像です。`,
          success_title: `NovelAI画像を生成しました`,
          field_prompt: `プロンプトタグ`,
          field_model: `モデル`,
          field_generation_time: `生成時間`,
          field_orientation: `向き`,
          field_negative_tags: `追加ネガティブタグ`,
          no_api_key_title: `NovelAI APIキーが必要です`,
          no_api_key_description: `このサーバーでは利用可能なNovelAI APIキーがありません。\`/optional-key novelai set\` で設定するか、メインプロバイダーをNovelAIに切り替えてください。`,
          invalid_reference_title: `無効なキャラクター参照画像です`,
          invalid_reference_description: `キャラクター参照画像には、NovelAIが読み取れる有効な画像添付を指定してください。`,
          character_reference_requires_v4_title: `V4モデルが必要です`,
          character_reference_requires_v4_description: `キャラクター参照画像は現在NovelAI V4モデルでのみ利用できます。現在の有効モデル: **{model}**。`,
          auth_error_title: `NovelAI認証に失敗しました`,
          auth_error_description: `NovelAIが画像生成リクエストを拒否しました。APIキーとサブスクリプション状態を確認してから再試行してください。`,
          quota_error_title: `NovelAI生成クォータを使い切りました`,
          quota_error_description: `このアカウントではNovelAI画像生成に必要なクォータまたはAnlasクレジットが不足しています。アカウントを補充するか、クォータのリフレッシュ後に再試行してください。`,
          rate_limit_error_title: `NovelAIのレート制限に達しました`,
          rate_limit_error_description: `NovelAIのレート制限により画像生成できませんでした。少し待ってから再試行してください。`,
          error_title: `NovelAI画像生成に失敗しました`,
          error_description: `NovelAIで画像を生成できませんでした。
\`\`\`
{error}
\`\`\``,
        },
        model: {
          description: `このサーバーでNovelAI画像ツールが使う拡散モデルを選択します。`,
          modal_title: `NovelAI画像生成モデル`,
          select_label: `画像モデル`,
          select_description: `専用のNovelAIモデルを選ぶか、Automaticで共有/既定動作を使います。`,
          select_placeholder_current_override: `現在の上書き値: {model}`,
          select_placeholder_current_automatic: `Automaticモード: 現在は {model}`,
          automatic_label: `自動`,
          automatic_description: `共有画像モデルがNovelAIならそれを使い、そうでなければNovelAI既定モデルを使います。`,
          no_models_title: `利用可能なNovelAIモデルがありません`,
          no_models_description: `このBot環境ではNovelAI画像モデルが利用できません。`,
          invalid_model_title: `無効なモデルです`,
          invalid_model_description: `有効なNovelAI画像モデルを選択してください。`,
          already_selected_title: `モデルは既に選択済みです`,
          already_selected_description: `NovelAI画像モデルモードは既に **{mode}** です。`,
          success_title: `NovelAI画像モデルを更新しました`,
          success_description: `このサーバーのNovelAI画像モデル挙動:
\`\`\`
Mode: {mode}
Effective model: {effective_model}
Source: {source}
\`\`\``,
          source_override: `NovelAIモデル上書き`,
          source_shared: `共有画像モデル (/config model image)`,
          source_default: `NovelAI既定モデル`,
        },
        params: {
          description: `このサーバー用にNovelAI画像生成のサンプラーと品質設定を上書きします。`,
          modal_title: `NovelAI画像生成パラメータ`,
          sampler_label: `サンプラー`,
          sampler_description: `変更したいSamplerを選択してください。未選択のままなら現在の値を維持します。`,
          sampler_placeholder_current: `現在の上書き値: {sampler}`,
          sampler_placeholder_default: `現在、上書きなし`,
          option_default_suffix: `（デフォルト）`,
          sampler_option_k_euler_ancestral: `Euler Ancestral`,
          sampler_option_k_euler: `Euler`,
          sampler_option_k_dpmpp_2s_ancestral: `DPM++ 2S Ancestral`,
          sampler_option_k_dpmpp_2m_sde: `DPM++ 2M SDE`,
          sampler_option_k_dpmpp_2m: `DPM++ 2M`,
          sampler_option_k_dpmpp_sde: `DPM++ SDE`,
          steps_label: `ステップ数`,
          steps_description: `1〜50の整数。空欄でデフォルトを使います。`,
          steps_placeholder: `例: 23`,
          scale_label: `プロンプトガイダンス`,
          scale_description: `0.0〜10.0の小数。空欄でデフォルトを使います。`,
          scale_placeholder: `例: 5`,
          noise_schedule_label: `ノイズスケジュール`,
          noise_schedule_description: `変更したいNoise Scheduleを選択してください。未選択のままなら現在の値を維持します。`,
          noise_schedule_placeholder_current: `現在の上書き値: {noise_schedule}`,
          noise_schedule_placeholder_default: `現在、上書きなし`,
          noise_schedule_option_karras: `Karras`,
          noise_schedule_option_exponential: `指数`,
          noise_schedule_option_polyexponential: `多項指数`,
          cfg_rescale_label: `プロンプトガイダンス再スケール`,
          cfg_rescale_description: `0.0〜1.0の小数。空欄でデフォルトを使います。`,
          cfg_rescale_placeholder: `例: 0.0`,
          invalid_sampler_title: `無効なSamplerです`,
          invalid_sampler_description: `Samplerは次のいずれかである必要があります: {options}。`,
          invalid_steps_title: `無効なStepsです`,
          invalid_steps_description: `Stepsは{min}〜{max}の整数で入力してください。`,
          invalid_scale_title: `無効なPrompt Guidanceです`,
          invalid_scale_description: `Prompt Guidanceは{min}〜{max}の数値で入力してください。`,
          invalid_noise_schedule_title: `無効なNoise Scheduleです`,
          invalid_noise_schedule_description: `Noise scheduleは次のいずれかである必要があります: {options}。`,
          invalid_cfg_rescale_title: `無効なPrompt Guidance Rescaleです`,
          invalid_cfg_rescale_description: `Prompt Guidance Rescaleは{min}〜{max}の数値で入力してください。`,
          success_title: `画像生成パラメータを更新しました`,
          success_description: `このサーバーの有効なNovelAI画像生成パラメータ:
\`\`\`
Sampler: {sampler}
Steps: {steps}
Prompt Guidance: {scale}
Noise schedule: {noise_schedule}
Prompt Guidance Rescale: {cfg_rescale}
\`\`\``,
        },
      },
      attg: {
        description: `NovelAI KayraおよびEratoプロンプト用のAuthor/Title/Tags/Genre/Starsメタデータを設定します。`,
        modal_title: `ATTGの設定`,
        persona_select_title: `ペルソナを選択`,
        author_label: `作者`,
        author_placeholder: `例: 山田太郎`,
        title_label: `タイトル`,
        title_placeholder: `例: 私の物語`,
        tags_label: `タグ`,
        tags_placeholder: `例: ロマンス, 冒険`,
        genre_label: `ジャンル`,
        genre_placeholder: `例: ファンタジー, 日常`,
        stars_label: `スター (Eratoのみ)`,
        stars_placeholder: `1-5`,
        invalid_stars_title: `スター値が無効です`,
        invalid_stars_description: `スターは1〜5の整数か、空欄にしてください。`,
        success_title: `ATTGメタデータを更新しました`,
        success_description: `**{persona_name}**のATTGメタデータを更新しました。`,
        cleared_title: `ATTGメタデータをクリアしました`,
        cleared_description: `**{persona_name}**のATTGメタデータをすべてクリアしました。`,
      },
    },
    bot: {
      generate: {
        description: `現在のチャンネルの流れに合わせて素早く実行する手動生成コマンド。`,
        image: {
          description: `このチャンネルの直近コンテキストから素早くシーン画像を生成します。`,
          missing_permissions_title: `権限がありません`,
          missing_permissions_description: `このチャンネルでシーン画像を生成するには、チャンネルの閲覧、メッセージ履歴の読み取り、メッセージ送信、ファイル添付の権限が必要です。`,
          cooldown_active: `このサーバーの管理者がクールダウンを設定しています。\`/bot generate image\` を再度使用するまで、あと **{seconds}** 秒お待ちください。このクールダウンはメッセージトリガーや他の手動 /bot 操作と共有されています。`,
          channel_not_whitelisted: `このサーバーではホワイトリスト制限が有効です。\`/bot generate image\` はホワイトリスト登録チャンネル内で、かつホワイトリスト登録ロールを持つメンバーのみ使用でき、このチャンネルで許可されたペルソナだけを使えます。`,
          no_backend_title: `使える画像バックエンドがありません`,
          no_backend_description: `このサーバーで今使える画像バックエンドが見つかりませんでした。**{current_provider}** に有効な画像モデルを設定するか、NovelAI で描画したい場合は NovelAI のオプション API キーを追加してください。`,
          planner_unavailable_title: `計画用モデルがありません`,
          planner_unavailable_description: `現在のプロバイダーで構造化出力に対応したモデルが見つからないため、今はシーン画像を計画できません。`,
          planner_failed_title: `シーン計画に失敗しました`,
          planner_failed_description: `最近のチャンネル文脈を画像プランに変換できませんでした: {error}`,
          success_title: `シーン画像を投稿しました`,
          success_description: `最近のチャンネル文脈から構図を計画し、このチャンネルに画像を投稿しました。`,
          modal: {
            title: `シーン画像`,
            prompt_label: `追加指示（任意）`,
            prompt_description: `シーンプランナーに反映してほしい補足、雰囲気、修正を入力してください`,
            prompt_placeholder: `例: 雨を強調して、やわらかめの雰囲気で、二人とも見えるように`,
            setting_label: `構図プリセット`,
            setting_description: `この fire-and-forget シーン画像に使う構図プリセットを選択してください`,
            setting_storybeat_label: `ストーリービート`,
            setting_storybeat_description: `直近の場面を広めに切り取るシネマ風構図`,
            setting_character_label: `キャラクター重視`,
            setting_character_description: `主役や話者に寄せた近めの構図`,
            setting_snapshot_label: `スクエアスナップ`,
            setting_snapshot_description: `今この瞬間を収めるバランス型の正方形構図`,
            setting_vertical_label: `スマホ壁紙`,
            setting_vertical_description: `シルエットを活かした縦長構図`,
            backend_label: `画像バックエンド`,
            backend_description: `どのレンダラーでこのシーン画像を生成するか選択してください`,
            backend_current_label: `現在のプロバイダー`,
            backend_current_description: `{provider} の通常の画像生成フローとプロンプト形式を使います`,
            backend_novelai_label: `NovelAI`,
            backend_novelai_description: `シーンを NovelAI 向けタグに変換し、NovelAI の画像ツールで生成します`,
            persona_label: `送信ペルソナ`,
            persona_description: `生成された画像を投稿するペルソナを選んでください`,
          },
        },
      },
      respond: {
        description: `このチャンネルの最新メッセージに手動で応答をトリガーします。`,
        prompt_description: `コンテキスト末尾に追加する任意のシステムプロンプト。`,
        prompt_label: `プロンプト（任意）`,
        prompt_placeholder: `システム指示を追加（任意）...`,
        prefill_description: `私に続きを書いてほしい、アシスタントの返答の書き出し（任意）。`,
        prefill_label: `プリフィル（任意）`,
        prefill_placeholder: `アシスタントのプリフィルを追加（任意）...`,
        success_title: `手動応答がトリガーされました`,
        success_description: `このチャンネルの最新メッセージに応答しています...`,
        missing_permissions_title: `権限がありません`,
        missing_permissions_description: `このチャンネルのメッセージ履歴を読み取る権限がありません。**チャンネルを見る**および**メッセージ履歴を読む**権限があることを確認してください。`,
        select_persona_title: `ペルソナを選択`,
        select_persona_label: `ペルソナを選択`,
        select_persona_description: `応答するペルソナを選択してください。`,
        select_persona_placeholder: `応答するペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        embed_hide_notice: `\`/config notice-embeds visibility\` でこの埋め込みを非表示にできます。`,
        use_reasoning_label: `推論を使用`,
        use_reasoning_description: `利用可能な最も賢いモデルを使用して高度な推論モードを切り替えます。`,
        no_smart_model_title: `推論モデルが見つかりません`,
        no_smart_model_description: `現在のAIプロバイダーに推論モデルが見つかりませんでした。\`/config api-key set\`を使用して、推論モデルをサポートするプロバイダーに切り替えてください。`,
        no_messages_title: `メッセージが見つかりません`,
        no_messages_description: `このチャンネルにメッセージが見つかりません。 \`/bot respond\` を使う前に、少なくとも1件メッセージを送信してください。`,
        cooldown_active: `このサーバーの管理者がクールダウンを設定しています。\`/bot respond\` を再度使用するまで、あと **{seconds}** 秒お待ちください。このクールダウンはメッセージトリガーと共有されています。`,
        channel_not_whitelisted: `このサーバーではホワイトリスト制限が有効です。\`/bot respond\` はホワイトリスト登録チャンネル内で、かつホワイトリスト登録ロールを持つメンバーのみ使用でき、このチャンネルで許可されたペルソナだけを使えます。`,
      },
      kill: {
        description: `このチャンネルで現在のストリーム応答を停止し、キュー済み応答をすべてクリアします。`,
        success_title: `ストリームを停止しました`,
        success_description: `進行中の応答ストリーム（ある場合）を停止し、このチャンネルのキュー済み応答をクリアしました。`,
        nothing_to_stop_title: `停止・クリア対象がありません`,
        nothing_to_stop_description: `このチャンネルには停止できる進行中の応答ストリームも、クリアできるキュー済み応答もありません。`,
      },
      impersonate: {
        description: `ペルソナ、ユーザー、またはシステムプロンプトになりすます。`,
        target_description: `なりすます対象を選択してください。`,
        target_persona: `ペルソナ`,
        target_user: `ユーザー`,
        target_system: `システム`,
        user_select_title: `ユーザーを選択`,
        user_select_description: `なりすますユーザーを選択してください。`,
        user_select_placeholder: `なりすますユーザーを選択...`,
        persona_modal_title: `ペルソナになりすます`,
        persona_select_label: `ペルソナを選択`,
        persona_select_placeholder: `なりすますペルソナを選択...`,
        persona_message_label: `メッセージ`,
        persona_message_placeholder: `ペルソナとして送信するメッセージを入力...`,
        persona_success_title: `メッセージを送信しました`,
        persona_success_description: `{persona}としてメッセージを送信しました。`,
        persona_impersonation_notice_description: `\`/config notice-embeds visibility\` でこの埋め込みを非表示にできます。`,
        persona_impersonation_notice_footer: `{user}によるなりすまし`,
        user_impersonation_notice_description: `\`/config notice-embeds visibility\` でこの埋め込みを非表示にできます。あなたをどうなりすますか教えるには、\`/personal impersonate prompt\` を設定してください。`,
        user_impersonation_notice_footer: `{user}が{target}のなりすましをトリガーしました`,
        me_success_title: `ユーザーなりすましが発動しました`,
        me_success_description: `{user}としてメッセージを生成できました.`,
        no_messages_title: `メッセージが見つかりません`,
        no_messages_description: `このチャンネルにメッセージが見つかりません。ユーザーなりすましを使用する前に、少なくとも1つのメッセージを送信してください。`,
        cooldown_active: `このサーバーの管理者がクールダウンを設定しています。\`/bot impersonate me\` を再度使用するまで、あと **{seconds}** 秒お待ちください。このクールダウンはメッセージトリガーと\`/bot respond\`と共有されています。`,
        cooldown_active_user: `このサーバーの管理者がクールダウンを設定しています。\`/bot impersonate user\` を再度使用するまで、あと **{seconds}** 秒お待ちください。このクールダウンはメッセージトリガーと\`/bot respond\`と共有されています。`,
        channel_not_whitelisted: `このサーバーではホワイトリスト制限が有効です。\`/bot impersonate\` はホワイトリスト登録チャンネル内で、かつホワイトリスト登録ロールを持つメンバーのみ使用でき、このチャンネルで許可されたペルソナだけを使えます。`,
        channel_not_whitelisted_user: `このサーバーではホワイトリスト制限が有効です。\`/bot impersonate user\` はホワイトリスト登録チャンネル内で、かつホワイトリスト登録ロールを持つメンバーのみ使用でき、このチャンネルで許可されたペルソナだけを使えます。`,
        system_modal_title: `システムプロンプト注入`,
        system_content_label: `システムプロンプト`,
        system_content_placeholder: `システム指示を入力...`,
        system_title: `システムメッセージ`,
        system_injected_footer: `{user}により注入`,
        system_success_title: `システムプロンプトを注入しました`,
        system_success_description: `システムプロンプトが会話に注入されました。ボットは次のメッセージでこの指示を認識します。`,
        missing_permissions_title: `権限が不足しています`,
        missing_permissions_description: `このチャンネルでメッセージを送信するか、Webhookを管理する権限がありません。`,
        webhook_error_title: `Webhookエラー`,
        webhook_error_description: `なりすまし用のWebhookの作成に失敗しました。エラー：{error}`,
        no_personas_title: `ペルソナが見つかりません`,
        no_personas_description: `このサーバーにはペルソナが設定されていません。まず\`/config setup\`を使用してください。`,
      },
    },
    conditioning: {
      description: `ご褒美・おしおきの条件付け記憶を管理します。`,
      reward: {
        description: `ご褒美のふれあいで私を褒めます。`,
      },
      punish: {
        description: `しつけのふれあいで私を叱ります。`,
      },
      shared: {
        select_persona_title: `管理するペルソナを選択`,
        reason_line: `理由: \`\`{reason}\`\``,
        reward_footer: `❤️ {bot}はこれを覚えておきます。管理は /conditioning manage を使用してください。`,
        punish_footer: `💀 {bot}はこれを覚えておきます。管理は /conditioning manage を使用してください。`,
      },
      manage: {
        description: `このサーバー内の全ペルソナに注入対象の条件付け履歴を管理します。`,
        marker_reward: `❤️`,
        marker_punish: `💀`,
        none_title: `管理する条件付けはありません`,
        none_description: `このサーバーには管理できる注入対象の条件付け履歴がありません。`,
        too_many_title: `項目が多すぎます`,
        too_many_description: `{total_entries} 件の項目が見つかりました（{total_pages} ページ）。現在は最大 {max_pages} ページまで対応しています。`,
        select_page_title: `条件付けページを選択`,
        select_page_description: `管理したい注入対象の条件付け項目のページを選択してください。
項目数: {total_entries}
ページ数: {total_pages}
各項目にはペルソナ名とご褒美/おしおき種別が表示されます。`,
        checkbox_label: `条件付け項目`,
        checkbox_label_continued: `条件付け項目（続き）`,
        checkbox_description: `チェックを残すと保持されます。チェックを外すと、その注入対象の条件付けグループが削除されます。`,
        option_reason_description: `合計 {count} 回 • 理由: 「{reason}」`,
        option_label: `{type_marker} {persona_name} • {action}`,
        modal_title: `条件付けを管理`,
        done_button: `完了`,
        no_changes_title: `変更はありません`,
        no_changes_description: `すべてチェックされたままだったため、削除は行われませんでした。`,
        success_title: `条件付けを更新しました`,
        success_description: `{persona_count} 個のペルソナにまたがるご褒美グループ {reward_groups} 件、おしおきグループ {punish_groups} 件を削除しました（保存行 {deleted_rows} 件を削除）。`,
      },
    },
    reward: {
      description: `私へのご褒美インタラクション。`,
      headpat: {
        description: `ヘッドパットして応答をトリガーします。`,
        reason_description: `どうしてご褒美をくれるの？`,
        embed_title: `🫳 ヘッドパット・タイム！`,
        embed_description: `{user}は現在{bot}をなでています。`,
        history_label: `ヘッドパット`,
      },
      hug: {
        description: `ハグして応答をトリガーします。`,
        reason_description: `どうしてご褒美をくれるの？`,
        embed_title: `🤗 ハグ・タイム！`,
        embed_description: `{user}は{bot}をぎゅっと抱きしめています。`,
        history_label: `ハグ`,
      },
      kiss: {
        description: `キスして応答をトリガーします。`,
        reason_description: `どうしてご褒美をくれるの？`,
        embed_title: `💋 キス・タイム！`,
        embed_description: `{user}は{bot}にキスしました。`,
        history_label: `キス`,
      },
      tickle: {
        description: `くすぐって応答をトリガーします。`,
        reason_description: `どうしてご褒美をくれるの？`,
        embed_title: `🤭 くすぐり・タイム！`,
        embed_description: `{user}は{bot}をくすぐっています。`,
        history_label: `くすぐり`,
      },
    },
    punish: {
      description: `私をおしおきして応答をトリガーします。`,
      spank: {
        description: `ぺしっとして応答をトリガーします。`,
        reason_description: `どうしておしおきするの？`,
        embed_title: `🖐️ スパンク・タイム！`,
        embed_description: `{user}は{bot}をぺしっとしました。`,
        history_label: `スパンク`,
      },
      pinch: {
        description: `つねって応答をトリガーします。`,
        reason_description: `どうしておしおきするの？`,
        embed_title: `🤏 ピンチ・タイム！`,
        embed_description: `{user}は{bot}をつねりました。`,
        history_label: `つねり`,
      },
      bite: {
        description: `甘噛みして応答をトリガーします。`,
        reason_description: `どうしておしおきするの？`,
        embed_title: `🦷 バイト・タイム！`,
        embed_description: `{user}は{bot}を甘噛みしました。`,
        history_label: `甘噛み`,
      },
      squeeze: {
        description: `ぎゅっとして応答をトリガーします。`,
        reason_description: `どうしておしおきするの？`,
        embed_title: `👐 スクイーズ・タイム！`,
        embed_description: `{user}は{bot}をぎゅっと握りました。`,
        history_label: `スクイーズ`,
      },
    },
    support: {
      discord: {
        description: `バグ報告、フィードバック、コミュニティチャットのための公式Discordサーバーリンクを取得します。`,
        title: `Discordサーバーに参加`,
        description_text: `TomoriBotのヘルプが必要ですか？またはコミュニティと交流したいですか？

🔗 **Discordサーバー**: https://discord.gg/bjCfHm9QsB

参加して:
• バグや問題を報告
• フィードバックや提案を共有
• 他のユーザーや開発チームとチャット
• 新機能の最新情報を入手`,
      },
    },
    contribute: {
      github: {
        description: `GitHubリポジトリのリンクを取得し、TomoriBotへの貢献方法を学びます。`,
        title: `TomoriBotに貢献する`,
        description_text: `TomoriBotをより良くするお手伝いをしたいですか？貢献をお待ちしています！

🔗 **GitHubリポジトリ**: https://github.com/Bredrumb/TomoriBot

貢献方法:
• GitHubでリポジトリにスターを付ける ⭐
• バグ報告や機能リクエストを送信
• コードの改善や新機能を貢献
• TomoriBotを他の言語に翻訳するお手伝い
• ドキュメントの改善`,
      },
    },
    donate: {
      kofi: {
        description: `Ko-fiを通じてTomoriBotの開発を支援します。`,
        title: `TomoriBotの開発を支援`,
        description_text: `TomoriBotを使うのが好きですか？無料で維持し、継続的な開発を支援してください！

🔗 **Ko-fi**: https://ko-fi.com/bredrumb

あなたの寄付は以下に役立ちます:
• TomoriBotの運営と保守
• 新機能と改善の追加
• サーバーコストと開発時間のサポート
• TomoriBotを完全に無料で維持

大小問わず、すべての貢献に心から感謝します！ ❤️`,
      },
    },
    nsfw: {
      description: `年齢制限付きのコマンドと設定です。`,
      jailbreaks: {
        description: `このサーバーでの任意のjailbreak機能を管理します。`,
        modal_title: `Jailbreak設定を管理`,
        checkbox_label: `有効なJailbreak設定`,
        checkbox_description: `チェックした設定は有効のままです。外した設定は無効になります。`,
        injection_option: `プロンプト注入（18+同意の確認）`,
        unicode_spaces_option: `Unicodeスペース置換`,
        sanitize_option: `センシティブ語句のサニタイズ`,
        no_changes_title: `変更はありません`,
        no_changes_description: `Jailbreak設定は変更されませんでした。`,
        success_title: `Jailbreak設定を更新しました`,
        success_description: `Jailbreak設定を更新しました。現在 **{enabled_count}** 件の設定が有効です。`,
      },
    },
    config: {
      options: {
        enable: `有効化`,
        disable: `無効化`,
      },
      "api-key": {
        description: `AIプロバイダーのAPIキーを管理`,
        set: {
          description: `選択したAIプロバイダーのAPIキーを設定します。`,
          modal_title: `APIキーの設定`,
          provider_label: `AIプロバイダー`,
          provider_description: `APIキーに対応するAIプロバイダーを選択してください`,
          provider_placeholder: `プロバイダーを選択...`,
          api_key_label: `APIキーまたはエンドポイントURL`,
          api_key_description: `このキーは安全に保存されます。取得方法については、'/help api-key'コマンドを使用してください。ヒント：設定の保存には /config provider switch をお使いください。`,
          api_key_description_with_custom: `APIキー、またはCustomの場合はOpenAIエンドポイントURL（例：http://localhost:11434/v1）`,
          api_key_placeholder: `このキーは誰とも共有しないでください`,
          bearer_token_label: `Bearerトークン（任意）`,
          bearer_token_description: `Customエンドポイントの認証トークン。Authorization: Bearerヘッダーとして送信されます。`,
          bearer_token_placeholder: `認証不要の場合は空欄`,
          no_providers_title: `利用可能なプロバイダーがありません`,
          no_providers_description: `データベースに利用可能なAIプロバイダーがありません。\`/support discord\` で報告してください。`,
          invalid_key_title: `無効なAPIキー形式`,
          invalid_key_description: `提供されたAPIキーは短すぎるか無効のようです。有効なキーを提供してください。`,
          unsupported_provider_title: `サポートされていないプロバイダー`,
          unsupported_provider_description: `プロバイダー「{provider}」は現在APIキーの検証をサポートしていません。`,
          validation_error_title: `検証エラー`,
          validation_error_description: `APIキーの検証中にエラーが発生しました。もう一度お試しください。`,
          key_validation_failed_title: `APIキーの検証に失敗しました`,
          key_validation_failed_description: `{provider}に対して提供されたAPIキーは無効です。キーを確認してもう一度お試しください。`,
          no_default_model_title: `デフォルトモデルが見つかりません`,
          no_default_model_description: `{provider}プロバイダーのデフォルトモデルが見つかりませんでした。この問題を\`/support discord\`で報告してください。`,
          success_title: `APIキーが設定されました`,
          success_description: `{provider}のAPIキーが正常に検証、暗号化、保存されました。`,
          success_with_model_description: `{provider}のAPIキーが正常に検証、暗号化、保存されました。モデルは自動的に\`{model_name}\`（このプロバイダーのデフォルト）に変更されました。`,
          custom_success_with_model_description: `カスタムのOpenAI互換エンドポイントが正常に保存されました。このエンドポイントへのリクエストでは \`{model_name}\` を使用します。`,
          novelai_success_with_model_description: `NovelAIのAPIキーが正常に検証、暗号化、保存されました。モデルは自動的に\`{model_name}\`に変更されました。⚠️ **絵文字とスタンプの使用は自動的に無効化されました**。NovelAIのコンテキストを安定させるためです。\`/config bot-permissions\`でいつでも再有効化できます。`,
          zai_success_description: `{provider}のAPIキーが正常に検証、暗号化、保存されました。⚠️ **注意：** Z.aiの利用規約がコーディング/エージェントのシナリオのみに制限されました — 一般チャットでの使用は自己責任です。`,
          zai_success_with_model_description: `{provider}のAPIキーが正常に検証、暗号化、保存されました。モデルは自動的に\`{model_name}\`に変更されました。⚠️ **注意：** Z.aiの利用規約がコーディング/エージェントのシナリオのみに制限されました — 一般チャットでの使用は自己責任です。`,
        },
        delete: {
          description: `現在設定されているAIプロバイダーのAPIキーを削除します。`,
          no_key_title: `APIキーが設定されていません`,
          no_key_description: `現在削除するAPIキーが設定されていません。`,
          success_title: `APIキーが削除されました`,
          success_description: `AIプロバイダーのAPIキーが正常に削除されました。新しいキーが設定されるまで、私のチャット機能は無効になります。`,
        },
        rotation: {
          description: `負荷分散とフェイルオーバー用のAPIキーローテーションを管理します。`,
          action_description: `アクションを選択：キーを追加するか、すべてのキーを削除`,
          action_add: `キーを追加`,
          action_purge: `すべてのキーを削除`,
          key_description: `ローテーションプールに追加するAPIキー（追加アクションに必要）`,
          no_main_key_title: `メインAPIキーがありません`,
          no_main_key_description: `ローテーションキーを追加する前に、\`/config api-key set\`を使用してメインAPIキーを設定する必要があります。`,
          custom_provider_title: `サポートされていません`,
          custom_provider_description: `カスタムプロバイダーではAPIキーローテーションはサポートされていません。`,
          key_required_title: `キーが必要です`,
          key_required_description: `「追加」アクションを使用する場合は、APIキーを入力してください。`,
          add_success_title: `ローテーションキーが追加されました`,
          add_success_description: `新しいAPIキーがローテーションプールに正常に追加されました。現在、{provider}に**{count}**個のローテーションキーがあります。キーはラウンドロビン順序で自動フェイルオーバーとともに使用されます。`,
          purge_success_title: `ローテーションキーが削除されました`,
          purge_success_description: `ローテーションプールから**{count}**個のキーが正常に削除されました。メインAPIキーのみが使用されます。`,
          no_keys_title: `ローテーションキーがありません`,
          no_keys_description: `削除するローテーションキーがありません。メインAPIキーのみが設定されています。`,
        },
      },
      custom: {
        endpoint_url_invalid_title: `無効なエンドポイントURL`,
        endpoint_url_invalid_description: `カスタムエンドポイントの有効なHTTPまたはHTTPS URLを入力してください。`,
        endpoint_url_protocol_description: `URLはHTTPまたはHTTPSプロトコルを使用する必要があります。`,
        endpoint_url_https_required_description: `本番環境ではHTTPSが必要です。公開アクセス可能なHTTPSエンドポイントを使用してください（例：https://my-llm-server.com/v1）。`,
        endpoint_url_http_localhost_only_description: `HTTPは開発環境のlocalhost専用です。リモートサーバーにはHTTPSを使用してください。`,
        endpoint_url_localhost_blocked_description: `本番環境ではlocalhostエンドポイントは使用できません。公開アクセス可能なHTTPSエンドポイントを使用してください。`,
        endpoint_url_dns_failed_description: `ホスト名 \`{hostname}\` を解決できませんでした。サーバーが公開アクセス可能であり、URLが正しいことを確認してください。`,
        endpoint_url_private_address_description: `\`{address}\` はプライベートまたは予約済みIPアドレスです。公開アクセス可能なHTTPSエンドポイントを使用してください。`,
        model_name_label: `モデル名（必須）`,
        model_name_placeholder: `例：gpt-5.4 または gemma3:latest`,
        model_name_required_description: `確認する前に正確なモデル名を設定してください。ChatMockなら \`gpt-5.4\` のような名前、Ollamaなら \`gemma3:latest\` のような正確なモデルタグを入力してください。`,
        capabilities_prompt: `エンドポイントが期待する正確なモデル名を設定してから、そのモデルがサポートする機能を選択し、**確認**をクリックしてください:`,
        capability_tools_label: `関数呼び出し（ツール）?`,
        capability_tools_yes: `関数呼び出しをサポート`,
        capability_tools_no: `関数呼び出し非対応`,
        capability_images_label: `画像理解?`,
        capability_images_yes: `画像をサポート`,
        capability_images_no: `画像非対応`,
        capability_videos_label: `動画理解?`,
        capability_videos_yes: `動画をサポート`,
        capability_videos_no: `動画非対応`,
        capability_structoutput_label: `構造化出力?`,
        capability_structoutput_yes: `構造化出力をサポート`,
        capability_structoutput_no: `構造化出力非対応`,
        capabilities_timeout: `モデル機能の設定がタイムアウトしました。もう一度お試しください。`,
      },
      provider: {
        description: `保存されたプロバイダー設定を管理`,
        switch: {
          description: `AIプロバイダーを切り替えます（現在の設定を保存して簡単に復元可能）。`,
          modal_title: `プロバイダーの切替`,
          provider_label: `切替先プロバイダー`,
          provider_description: `切り替えるプロバイダーを選択してください。(保存済み)のプロバイダーは設定が保存されています。`,
          provider_placeholder: `プロバイダーを選択...`,
          api_key_label: `APIキーまたはエンドポイントURL（任意）`,
          api_key_description_with_custom: `保存済みを復元するには空欄のまま、新規カスタムの場合はOpenAIエンドポイントURLを入力してください。`,
          api_key_placeholder: `保存済みキーを使用するには空欄`,
          bearer_token_label: `Bearerトークン（任意）`,
          bearer_token_description: `Customエンドポイントの認証トークン。Authorization: Bearerヘッダーとして送信されます。`,
          bearer_token_placeholder: `認証不要の場合は空欄`,
          save_current_label: `現在の設定を保存しますか？`,
          save_current_description: `現在のプロバイダー設定を保存して、後で復元できるようにします。`,
          saved_indicator: `(保存済み)`,
          first_time_no_key_title: `APIキーが必要です`,
          first_time_no_key_description: `**{provider}**の保存済み設定がありません。新しいプロバイダーに初めて切り替える場合は、APIキーを入力してください。`,
          success_title: `プロバイダーを切り替えました`,
          success_description: `**{provider}**に切り替えました。モデルは\`{model_name}\`になりました。`,
          success_restored_description: `保存済みの設定で**{provider}**に切り替えました。モデルは\`{model_name}\`になりました。{restored_details}`,
          restored_label: `復元済み`,
          no_restores_label: `復元データなし`,
          carried_over_note: `*その他の設定は現在の設定から引き継がれます。*`,
          restore_more_suffix: `（他{count}件）`,
          skipped_overrides_note: `⚠️ {count}件のオーバーライドをスキップしました — チャンネル、ペルソナ、またはモデルが存在しません。`,
          config_label_chat_model: `チャットモデル`,
          config_label_vision_model: `ビジョンモデル`,
          config_label_image_model: `画像モデル`,
          config_label_embedding_model: `埋め込みモデル`,
          config_label_sampler_settings: `サンプラー設定`,
          config_label_fallback_models: `フォールバックモデル ({count})`,
          config_label_channel_overrides: `チャンネルオーバーライド ({count})`,
          config_label_persona_overrides: `ペルソナオーバーライド ({count})`,
          config_label_fallback_models_none: `フォールバックモデル`,
          config_label_channel_overrides_none: `チャンネルオーバーライド`,
          config_label_persona_overrides_none: `ペルソナオーバーライド`,
          config_label_custom_endpoint: `カスタムエンドポイント`,
          sampler_preset_label: `プリセット`,
          sampler_temperature_label: `温度`,
          sampler_top_p_label: `Top P`,
          sampler_top_k_label: `Top K`,
          sampler_frequency_penalty_label: `頻度ペナルティ`,
          sampler_presence_penalty_label: `出現ペナルティ`,
          sampler_min_p_label: `Min P`,
          sampler_logit_biases_label: `ロジットバイアス`,
          success_novelai_description: `**{provider}**に切り替えました。モデルは\`{model_name}\`になりました。⚠️ **絵文字とスタンプの使用は自動的に無効化されました**。NovelAIのコンテキストを安定させるためです。\`/config bot-permissions\`でいつでも再有効化できます。`,
          success_zai_description: `**{provider}**に切り替えました。モデルは\`{model_name}\`になりました。⚠️ **注意：** Z.aiの利用規約がコーディング/エージェントのシナリオのみに制限されました — 一般チャットでの使用は自己責任です。`,
        },
        remove: {
          description: `保存されたプロバイダー設定を削除します。`,
          no_saved_title: `保存済み設定がありません`,
          no_saved_description: `削除する保存済みプロバイダー設定がありません。保存済み設定は「現在の設定を保存」を有効にして\`/config provider switch\`を使用すると作成されます。`,
          select_placeholder: `削除するプロバイダーを選択...`,
          success_title: `保存済み設定を削除しました`,
          success_description: `**{provider}**の保存済み設定を削除しました。次回このプロバイダーに切り替える際はAPIキーが必要です。`,
          confirm_title: `保存済み設定を削除しますか？`,
          confirm_description: `**{provider}**の保存済み設定を削除してもよろしいですか？保存されたAPIキーとモデル選択が削除されます。`,
        },
      },
      "notice-embeds": {
        description: `チャットに表示する通知埋め込みを管理します。`,
        visibility: {
          description: `チャットに残す通知埋め込みを選択します。`,
          modal_title: `通知埋め込みの表示設定`,
          checkbox_label: `表示する通知埋め込み`,
          checkbox_label_continued: `表示する通知埋め込み（続き）`,
          checkbox_description: `チェックした埋め込みはチャットに表示されます。外した埋め込みは非表示になります。ツール進行通知は許可されていれば thoughtlogs に送られます。`,
          no_changes_title: `変更はありません`,
          no_changes_description: `通知埋め込みの表示設定はすでにその状態です。`,
          success_title: `通知埋め込みの表示設定を更新しました`,
          success_description: `今回非表示にした項目（{hidden_count}）: {hidden_list}
今回再表示した項目（{restored_count}）: {restored_list}`,
          too_many_title: `通知埋め込みタイプが多すぎます`,
          too_many_description: `設定された通知埋め込みタイプは {count} 件あり、モーダル上限の {max_entries} 件（{max_groups} グループ）を超えています。`,
          notice_web_search_label: `ウェブ検索`,
          notice_web_search_description: `「ウェブを検索中...」通知を表示します。`,
          notice_image_search_label: `画像検索`,
          notice_image_search_description: `画像検索の進行通知を表示します。`,
          notice_video_search_label: `動画検索`,
          notice_video_search_description: `動画検索の進行通知を表示します。`,
          notice_news_search_label: `ニュース検索`,
          notice_news_search_description: `ニュース検索の進行通知を表示します。`,
          notice_web_fetch_label: `Web取得`,
          notice_web_fetch_description: `Webページ取得・読み取り通知を表示します。`,
          notice_document_reading_label: `ドキュメント読取`,
          notice_document_reading_description: `ドキュメント読み取り通知を表示します。`,
          notice_image_generation_label: `画像生成`,
          notice_image_generation_description: `画像生成通知を表示します。`,
          notice_video_generation_label: `動画生成`,
          notice_video_generation_description: `動画生成通知を表示します。`,
          notice_image_editing_label: `画像編集`,
          notice_image_editing_description: `画像編集・インペイント通知を表示します。`,
          notice_image_analysis_label: `画像解析`,
          notice_image_analysis_description: `画像解析通知を表示します。`,
          notice_gif_processing_label: `GIF処理`,
          notice_gif_processing_description: `GIF処理通知を表示します。`,
          notice_youtube_processing_label: `YouTube処理`,
          notice_youtube_processing_description: `YouTube視聴通知を表示します。`,
          notice_mcp_tool_call_label: `MCPツール呼び出し`,
          notice_mcp_tool_call_description: `汎用MCPツール呼び出し通知を表示します。`,
          notice_respond_embed_label: `応答成功`,
          notice_respond_embed_description: `/bot respond の成功埋め込みを表示します。`,
          notice_impersonation_notice_label: `なりすまし通知`,
          notice_impersonation_notice_description: `ペルソナ/ユーザーなりすまし通知埋め込みを表示します。`,
          notice_fallback_model_usage_label: `フォールバックモデル使用`,
          notice_fallback_model_usage_description: `先行モデル失敗後にフォールバックモデルが応答した際の情報埋め込みを表示します。`,
        },
      },
      humanizer: {
        description: `私の応答がどれだけ「人間らしい」か設定します。カスタムプロンプトを設定するには \`/config system-prompt set\` を使用してください。`,
        modal_title: `ヒューマナイザーレベルの設定`,
        select_label: `ヒューマナイザーレベル`,
        select_description: `応答スタイルを選択してください（デフォルト: 1 ライト）。`,
        choice_none: `0: なし (生のAI出力)`,
        choice_light: `1: ライト（デフォルト、システムプロンプト）`,
        choice_medium: `2: ミディアム（タイピングシミュレーション）`,
        choice_heavy: `3: ヘビー（文単位チャンク＆小文字）`,
        desc_none: `システムプロンプトなし。行動指示のない生のAI出力。`,
        desc_light: `リクエストごとにシステムプロンプトを注入（/config system-prompt）。タイピングシミュレーションなし。`,
        desc_medium: `ライト機能 + タイピングインジケーターとメッセージ間のランダムな思考ポーズ。`,
        desc_heavy: `全機能 + 文単位のメッセージ分割とカジュアルなテキストスタイル（小文字、句読点の削減）。`,
        invalid_value_description: `ヒューマナイザーレベルは {min} から {max} の間でなければなりません。`,
        already_set_title: `ヒューマナイザーは既に設定済みです`,
        already_set_description: `ヒューマナイザーレベルは既に \`{value}\` に設定されています。`,
        success_title: `ヒューマナイザーレベルが更新されました`,
        success_description: `ヒューマナイザーレベルが \`{previous_value}\` から \`{value}\` に変更されました。`,
      },
      cooldown: {
        type: {
          choice_off: `オフ`,
          choice_per_user: `ユーザーごと`,
          choice_per_channel: `チャンネルごと`,
          choice_server_wide: `サーバー全体`,
          choice_strict_server_wide: `厳密サーバー全体`,
        },
      },
      "self-reply-limit": {
        description: `ペルソナ同士の自己返信チェーンを管理します（デフォルト: 3）。`,
        limit_description: `許可する自己返信回数 (0-10、0で無効、デフォルト: 3)`,
        limit: {
          invalid_range_title: `無効な上限値`,
          invalid_range_description: `上限は {min} 〜 {max} の範囲で指定してください。`,
          already_set_title: `既に設定済み`,
          already_set_description: `自己返信上限はすでに **{limit}** に設定されています。`,
          success_title: `自己返信上限を更新しました`,
          success_description: `自己返信チェーンの上限を **{limit}** に設定しました。`,
          success_disabled_title: `自己返信を無効化しました`,
          success_disabled_description: `自己返信チェーンを無効にしました。`,
        },
      },
      sendlimit: {
        description: `1回の応答で送信するメッセージ数の上限を設定します（デフォルト: 0 = 無制限）。`,
        limit_description: `応答あたりの最大メッセージ数 (0-40、0で無制限、デフォルト: 0)`,
        invalid_range_title: `無効な上限値`,
        invalid_range_description: `上限は {min} 〜 {max} の範囲で指定してください。`,
        already_set_title: `既に設定済み`,
        already_set_description: `送信メッセージ上限はすでに **{limit}** に設定されています。`,
        success_title: `送信上限を更新しました`,
        success_description: `応答は **{limit}** メッセージに制限されます。上限に達すると、文の区切りで自然に停止します。`,
        success_disabled_title: `送信上限を無効化しました`,
        success_disabled_description: `送信メッセージ上限を解除しました。応答は制限されなくなります。`,
      },
      "self-debug": {
        description: `私が送信した診断埋め込みをコンテキストに取り込むか切り替えます。`,
        set_description: `セルフデバッグ埋め込み取り込みを有効または無効にします。`,
        already_set_title: `セルフデバッグは既に設定済みです`,
        already_enabled_description: `セルフデバッグは既に**有効**です。`,
        already_disabled_description: `セルフデバッグは既に**無効**です。`,
        success_title: `セルフデバッグを更新しました`,
        enabled_success: `セルフデバッグを**有効**にしました。私のエラー埋め込みと診断埋め込みを [System: ...] メッセージとしてコンテキストに取り込みます。`,
        disabled_success: `セルフデバッグを**無効**にしました。私のエラー埋め込みと診断埋め込みはコンテキストに取り込みません。`,
      },
      "message-fetch-limit": {
        description: `コンテキスト取得メッセージ数を設定します (20-100、デフォルト: 80)。`,
        limit_description: `コンテキスト取得メッセージ数 (20-100、デフォルト: 80)。`,
        limit: {
          invalid_range_title: `無効な上限値`,
          invalid_range_description: `上限は {min} 〜 {max} の範囲で指定してください。`,
          already_set_title: `既に設定済み`,
          already_set_description: `メッセージ取得上限はすでに **{limit}** に設定されています。`,
          success_title: `メッセージ取得上限を更新しました`,
          success_description: `今後はコンテキスト用に最大 **{limit}** 件のメッセージを取得します。`,
        },
      },
      "persona-trigger-limit": {
        description: `1つのメッセージで起動できるペルソナ数を管理します（デフォルト: 3）。`,
        limit_description: `1メッセージで起動できるペルソナ上限 (1-10、デフォルト: 3)`,
        limit: {
          invalid_range_title: `無効な上限値`,
          invalid_range_description: `上限は {min} 〜 {max} の範囲で指定してください。`,
          already_set_title: `既に設定済み`,
          already_set_description: `マルチトリガー上限はすでに **{limit}** に設定されています。`,
          success_title: `マルチトリガー上限を更新しました`,
          success_description: `メッセージごとのペルソナ起動上限を **{limit}** に設定しました。`,
        },
      },
      voice: {
        description: `ペルソナごとの音声設定を管理します。`,
        transcripts: {
          description: `音声トランスクリプトのチャットモードを切り替えます。`,
          set_description: `有効にするとトランスクリプトをチャットメッセージとして投稿します。無効にすると内部キャッシュを使用します。`,
          already_set_title: `既に設定済み`,
          already_enabled_description: `このサーバーでは音声トランスクリプトのチャットモードは既に有効になっています。`,
          already_disabled_description: `このサーバーでは音声トランスクリプトのチャットモードは既に無効になっています。`,
          success_title: `音声トランスクリプトモードを更新しました`,
          enabled_success: `音声トランスクリプトのチャットモードが**有効**になりました。音声メッセージはトランスクリプトされ、Webhookを通じてチャットメッセージとして投稿されます。音声ファイルはAIに直接渡されません。`,
          disabled_success: `音声トランスクリプトのチャットモードが**無効**になりました。トランスクリプトは従来通り内部で処理されます。`,
        },
        elevenlabs: {
          description: `ペルソナに使うElevenLabs音声を選択します。`,
          select_persona_title: `音声を設定するペルソナを選択`,
          no_key_title: `ElevenLabs APIキーが設定されていません`,
          no_key_description: `ペルソナの音声を選ぶにはElevenLabsキーが必要です。まず \`/optional-key elevenlabs set\` で設定してください。`,
          voice_fetch_failed_title: `音声一覧を取得できませんでした`,
          voice_fetch_failed_description: `このサーバーで利用できるElevenLabs音声を読み込めませんでした。設定済みキーを確認して、もう一度お試しください。`,
          no_voices_title: `利用可能な音声がありません`,
          no_voices_description: `設定されているElevenLabsアカウントから利用可能な音声が返されませんでした。`,
          modal_title: `ElevenLabs音声を選択`,
          select_label: `音声`,
          select_description: `このペルソナが音声メッセージ生成で使う音声を選択してください。`,
          select_placeholder: `音声を選択...`,
          clear_choice_label: `音声を無効化`,
          clear_choice_description: `このペルソナの現在のElevenLabs音声設定を削除します。`,
          voice_available_description: `利用可能な音声`,
          success_title: `ペルソナの音声を更新しました`,
          success_description: `**{persona}** は今後、ElevenLabs音声メッセージで **{voice}** を使用します。`,
          cleared_title: `ペルソナの音声を解除しました`,
          cleared_description: `**{persona}** のElevenLabs音声設定を削除しました。`,
        },
      },
      model: {
        text: {
          description: `私が使用する基盤となるAIモデルを変更します。`,
          modal_title: `AIモデルの選択`,
          select_label: `AIモデル`,
          select_description: `私が使用するAIモデルを選択してください。無料でないモデルの価格については、各AIプロバイダーの公式サイトをご確認ください。`,
          select_placeholder: `モデルを選択...`,
          no_api_key_title: `APIキーが設定されていません`,
          no_api_key_description: `モデルを変更する前にAPIキーを設定する必要があります。まず \`/config api-key set\` を使用してAPIキーを設定してください。`,
          no_models_title: `モデルが見つかりません`,
          no_models_description: `データベースから利用可能なAIモデルを読み込めませんでした。`,
          invalid_model_title: `無効なモデル`,
          invalid_model_description: `選択されたモデル名は無効か、利用できません。`,
          already_selected_title: `モデルは既に選択済みです`,
          already_selected_description: `私は既に \`{model_name}\` モデルを使用しています。`,
          validating_api_key_compatibility_title: `APIキーを検証中`,
          validating_api_key_compatibility: `新しいプロバイダーとのAPIキー互換性を検証中...`,
          api_key_incompatible_title: `APIキーに互換性がありません`,
          api_key_incompatible_description: `現在のAPIキーは{provider}の{model_name}モデルと互換性がありません。\`/config api-key set\`を使用して{provider}の有効なAPIキーを設定してください。`,
          validation_error_title: `検証エラー`,
          validation_error_description: `APIキーの互換性検証中にエラーが発生しました。もう一度お試しください。`,
          success_title: `モデルが更新されました`,
          success_description: `これからは \`{model_name}\` モデルを使用します（以前は \`{previous_model}\`）。`,
          custom_updated_title: `カスタムモデルの機能が更新されました`,
          custom_updated_description: `カスタムモデルが再設定されました。

**モデル名:** \`{model_name}\`
**有効な機能:** {capabilities}`,
          scope_description: `このモデル変更のスコープを設定します（グローバル、チャンネル、またはペルソナ）。`,
          scope_global: `グローバル（サーバーデフォルト）`,
          scope_channel: `チャンネル（このチャンネルのみ）`,
          scope_persona: `ペルソナ（特定のペルソナのみ）`,
          scope_set_channel_success: `{channel} のモデルを **{model}** に設定しました`,
          scope_set_persona_success: `**{persona}** のモデルを **{model}** に設定しました`,
          other_model_prompt_description: `**other-model** を選択しました。

下のボタンをクリックして、OpenRouter モデルのコードネームを入力してください（例：\`xai/grok-2\`、\`openrouter/free\`、\`nvidia/nemotron-4-340b-instruct\`）。`,
          other_model_modal_title: `OpenRouter モデルを入力`,
          other_model_model_label: `OpenRouter モデルコードネーム`,
          other_model_model_placeholder: `xai/grok-2`,
          other_model_validating_title: `モデルを検証中`,
          other_model_validating_description: `OpenRouter で \`{model_name}\` の機能を取得しています...`,
          other_model_validation_failed_title: `モデルが見つかりません`,
          other_model_validation_failed_description: `OpenRouter で \`{model_name}\` が見つかりませんでした。モデルIDが正しいか確認して再試行してください。`,
          other_model_configured_title: `カスタムモデルの設定が完了`,
          other_model_configured_description: `カスタム OpenRouter モデルが \`{model_name}\` に設定されました。

**検出された機能:** {capabilities}`,
        },
        embedding: {
          description: `文書検索に使用する埋め込みモデルを変更します。`,
          modal_title: `埋め込みモデルを選択`,
          select_label: `埋め込みモデル`,
          select_description: `文書検索に使用する埋め込みモデルを選択してください。`,
          select_placeholder: `モデルを選択...`,
          no_api_key_title: `APIキーが設定されていません`,
          no_api_key_description: `埋め込みモデルを変更するにはAPIキーが必要です。\`/config api-key set\`を使用してください。`,
          no_models_title: `埋め込みモデルがありません`,
          no_models_description: `プロバイダー {provider} で利用可能な埋め込みモデルが見つかりませんでした。`,
          invalid_model_title: `無効なモデル`,
          invalid_model_description: `選択された埋め込みモデルは無効です。`,
          already_selected_title: `既に選択されています`,
          already_selected_description: `既に \`{model_name}\` を使用しています。`,
          reembed_started_title: `再埋め込み中`,
          reembed_started_description: `新しいモデルで文書の埋め込みを再生成しています。しばらくお待ちください...`,
          success_title: `埋め込みモデルを更新しました`,
          success_description: `埋め込みモデルを \`{model_name}\` に変更しました（以前: \`{previous_model}\`）。`,
          current_none: `なし`,
        },
        fallback: {
          description: `プライマリモデルが失敗した場合に使用するバックアップモデルを設定します。`,
          modal_title: `フォールバックモデルの設定`,
          slot_1_label: `フォールバックモデル1（必須）`,
          slot_2_label: `フォールバックモデル2`,
          slot_3_label: `フォールバックモデル3`,
          slot_4_label: `フォールバックモデル4`,
          slot_5_label: `フォールバックモデル5`,
          select_placeholder: `モデルを選択...`,
          no_models_title: `モデルが見つかりません`,
          no_models_description: `現在のプロバイダーで利用可能なモデルがありません。`,
          custom_provider_title: `非対応`,
          custom_provider_description: `カスタムプロバイダーではフォールバックモデルはサポートされていません。`,
          primary_conflict_title: `選択が無効です`,
          primary_conflict_description: `選択したフォールバックモデルの一つ以上がサーバーのプライマリモデル \`{model}\` と一致しています。別のモデルを選択してください。`,
          success_title: `フォールバックモデルを更新しました`,
          success_description: `フォールバック順:
{model_list}`,
          cleared_title: `フォールバックモデルをクリアしました`,
          cleared_description: `このサーバーにフォールバックモデルは設定されていません。`,
        },
        image: {
          description: `このサーバーの画像生成モデルを変更します。`,
          modal_title: `画像生成モデルの選択`,
          select_label: `画像モデル`,
          select_description: `画像生成モデルを選択してください。価格については各AIプロバイダーをご確認ください。`,
          select_placeholder: `画像モデルを選択...`,
          no_api_key_title: `APIキーが設定されていません`,
          no_api_key_description: `画像モデルを変更する前にAPIキーを設定する必要があります。`,
          no_models_title: `画像モデルが利用できません`,
          no_models_description: `現在のテキストモデルプロバイダー（{provider}）は画像生成をサポートしていません。まず \`/config api-key set\` を使用してGoogleまたはOpenRouterに切り替えてください。`,
          invalid_model_description: `選択された画像モデルは無効か、利用できません。`,
          already_selected_title: `モデルは既に選択済みです`,
          already_selected_description: `既に \`{model_name}\` 画像モデルを使用しています。`,
          success_title: `画像モデルが更新されました`,
          success_description: `画像生成には \`{model_name}\` モデルを使用します（以前は \`{previous_model}\`）。`,
          current_none: `なし`,
        },
        video: {
          description: `このサーバーの動画生成モデルを変更します。`,
          modal_title: `動画生成モデルの選択`,
          select_label: `動画モデル`,
          select_description: `動画生成モデルを選択してください。価格については各AIプロバイダーをご確認ください。`,
          select_placeholder: `動画モデルを選択...`,
          no_api_key_title: `APIキーが設定されていません`,
          no_api_key_description: `動画モデルを変更する前にAPIキーを設定する必要があります。`,
          no_models_title: `動画モデルが利用できません`,
          no_models_description: `現在のテキストモデルプロバイダー（{provider}）は動画生成をサポートしていません。まず \`/config api-key set\` を使用してGoogle、OpenRouter、またはZ.aiに切り替えてください。`,
          invalid_model_description: `選択された動画モデルは無効か、利用できません。`,
          already_selected_title: `モデルは既に選択済みです`,
          already_selected_description: `既に \`{model_name}\` 動画モデルを使用しています。`,
          success_title: `動画モデルが更新されました`,
          success_description: `動画生成には \`{model_name}\` モデルを使用します（以前は \`{previous_model}\`）。`,
          current_none: `なし`,
        },
        vision: {
          description: `チャットモデルが画像を見られない場合に画像分析用のビジョンモデルを設定します。`,
          modal_title: `ビジョンモデルの選択`,
          select_label: `ビジョンモデル`,
          select_description: `チャットモデルの代わりに画像を分析するビジョン対応モデルを選択してください。`,
          select_placeholder: `ビジョンモデルを選択...`,
          no_api_key_title: `APIキー未設定`,
          no_api_key_description: `ビジョンモデルを設定する前にAPIキーを設定してください。\`/config api-key set\` を使用してください。`,
          no_models_title: `ビジョンモデルがありません`,
          no_models_description: `現在のプロバイダー（{provider}）にはビジョン対応モデルがありません。先にビジョンモデルのあるプロバイダーに切り替えてください。`,
          invalid_model_title: `無効なモデル`,
          invalid_model_description: `選択されたビジョンモデルは無効または利用できません。`,
          already_selected_title: `モデルは既に選択済みです`,
          already_selected_description: `既に \`{model_name}\` をビジョンモデルとして使用しています。`,
          success_title: `ビジョンモデルが更新されました`,
          success_description: `ビジョン非対応のチャットモデルは \`{model_name}\` を使用して \`analyze_image\` ツールで画像を分析します。`,
          success_no_tools_description: `ビジョンモデルを \`{model_name}\` に設定しましたが、現在のチャットモデル（\`{chat_model}\`）は**ツール呼び出し**に対応していません。ビジョンモデルは \`analyze_image\` ツールが必要です — ツール対応のチャットモデルに切り替えてください。`,
          cleared_title: `ビジョンモデルを削除しました`,
          cleared_description: `ビジョンモデルが削除されました。ビジョン非対応のチャットモデルは画像を分析できなくなります。`,
          clear_option: `なし（ビジョンツールを無効化）`,
        },
      },
      rename: {
        description: `このサーバーでの私の名前を変更します。`,
        modal_title: `ペルソナ名の変更`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `名前を変更するペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        new_name_input_label: `新しい名前`,
        new_name_input_description: `新しい名前を入力してください（2〜32文字）。`,
        new_name_input_placeholder: `新しいペルソナ名を入力...`,
        invalid_length_title: `無効な名前の長さ`,
        invalid_length: `名前は2〜32文字でなければなりません。`,
        already_set_title: `名前は既に設定済みです`,
        already_set_description: `私の名前は既に \`{nickname}\` に設定されています。`,
        success_title: `名前が更新されました`,
        success_description: `私の名前が \`{old_nickname}\` から \`{new_nickname}\` に変更されました。`,
        success_with_trigger_description: `私の名前が \`{old_nickname}\` から \`{new_nickname}\` に変更されました。トリガーワードもそれに合わせて更新されました。`,
        success_with_discord_description: `私の名前が \`{old_nickname}\` から \`{new_nickname}\` に変更され、サーバーのニックネームも更新されました！`,
        success_with_trigger_and_discord_description: `私の名前が \`{old_nickname}\` から \`{new_nickname}\` に変更されました。トリガーワードとサーバーのニックネームが更新されました！`,
        nickname_update_failed_footer: `注：サーバーのニックネーム更新に失敗しました（「ニックネームの変更」権限が必要な場合があります）。`,
        partial_success_title: `名前は更新されましたが問題あり`,
        partial_success_description: `私の名前は \`{new_nickname}\` に変更されましたが、一部のトリガーワードの更新に失敗しました。`,
      },
      setup: {
        description: `初期設定プロセスを開始します。AIプロバイダーとパーソナリティを設定します。`,
        no_presets_found: `データベースに人格プリセットが見つかりません。\`/support discord\`で報告してください。`,
        modal_title: `初期の設定`,
        api_provider_label: `APIプロバイダー`,
        api_provider_description: `お好みのLLMのプロバイダーを選択してください`,
        api_provider_placeholder: `選択してください...`,
        api_key_label: `APIキーまたはエンドポイントURL`,
        api_key_description: `選択したLLMプロバイダーのAPIキーを入力してください。このキーは安全に保存されます。取得方法が不明な場合は、\`/help api-key\`コマンドを使用してください。`,
        api_key_description_with_custom: `APIキーまたはCustomエンドポイントURL。Bearerトークンはセットアップ後に追加可能。`,
        api_key_placeholder: `このキーは誰とも共有しないでください`,
        preset_label: `人格プリセット`,
        preset_description: `人格プリセットを選択してください`,
        preset_placeholder: `人格を選択...`,
        humanizer_label: `人間らしさの度合い`,
        humanizer_description: `どれくらい「人間らしく」返信すべきですか？`,
        humanizer_option_none_label: `なし`,
        humanizer_option_none_desc: `システムプロンプトなし。行動指示のない生のAI出力。`,
        humanizer_option_light_label: `軽`,
        humanizer_option_light_desc: `リクエストごとにシステムプロンプトを注入。タイピングシミュレーションなし。`,
        humanizer_option_default_label: `デフォルト`,
        humanizer_option_default_desc: `ライト機能 + タイピングインジケーターとメッセージ間のランダムな思考ポーズ。`,
        humanizer_option_heavy_label: `重`,
        humanizer_option_heavy_desc: `全機能 + 文単位のメッセージ分割とカジュアルなテキストスタイル（小文字、句読点の削減）。`,
        humanizer_field: `人間らしさ`,
        humanizer_invalid: `無効な人間らしさの度合いです。なし、軽、デフォルト、または重を選択してください。`,
        timezone_label: `タイムゾーンオフセット`,
        timezone_description: `時間単位のUTCオフセット。例：8または+8（シンガポール）、-5（ニューヨーク）、0（ロンドン）。空欄の場合はUTC。`,
        timezone_placeholder: `例：8、-5、0`,
        timezone_invalid_format: `エラー: 無効なタイムゾーン形式です。8、-5、0のような数値を入力してください。入力値: {provided}`,
        timezone_out_of_range: `エラー: タイムゾーンオフセットは{min}から{max}の間でなければなりません。入力値: {provided}`,
        api_key_invalid: `エラー: 提供されたAPIキーは短すぎるか無効です。`,
        api_key_validating: `APIキーを検証中...`,
        api_key_invalid_api: `エラー: プロバイダーがAPIキーを拒否しました。正しいか確認してください。`,
        preset_invalid: `エラー: 無効なペルソナ名です。利用可能なペルソナ名を正確に入力してください: {available}`,
        config_invalid: `エラー: 内部設定の検証に失敗しました。これを報告してください。`,
        setup_failed_description: `エラー: 初期設定構成をデータベースに保存できませんでした。もう一度お試しください。`,
        modal_values_missing: `エラー: 必須入力項目の一部がセットアップフォームから受信されませんでした。もう一度セットアップコマンドをお試しください。`,
        provider_invalid: `エラー: 無効なAPIプロバイダーが選択されました。利用可能なオプションから選択してください。`,
        preset_not_found: `エラー: 選択されたペルソナがデータベースに見つかりませんでした。もう一度お試しください。`,
        success_title: `🟢 設定完了！`,
        success_desc: `このサーバー用に設定が完了しました。私の設定を変更するには、\`/config\`、\`/server\`、\`/persona\`、\`/memory\`コマンドを使用してください。任意ですが推奨：\`/server initialize\` コマンドで絵文字・スタンプのメタデータを最適化できます。データのエクスポートやリセットは\`/memory personal export\`、\`/memory server export\`、\`/personal config\`、\`/server config\`でいつでも可能です。概要は以下の通りです:`,
        success_desc_with_model: `このサーバー用に設定が完了しました。使用モデルは \`{model_name}\`（このプロバイダーのデフォルト）です。私の設定を変更するには、\`/config\`、\`/server\`、\`/persona\`、\`/memory\`コマンドを使用してください。任意ですが推奨：\`/server initialize\` コマンドで絵文字・スタンプのメタデータを最適化できます。データのエクスポートやリセットは\`/memory personal export\`、\`/memory server export\`、\`/personal config\`、\`/server config\`でいつでも可能です。概要は以下の通りです:`,
        success_desc_dm: `このダイレクトメッセージ用に設定が完了しました。データのエクスポートやリセットは\`/memory personal export\`と\`/personal config\`でいつでも可能です。概要は以下の通りです:`,
        success_desc_dm_with_model: `このダイレクトメッセージ用に設定が完了しました。使用モデルは \`{model_name}\`（このプロバイダーのデフォルト）です。データのエクスポートやリセットは\`/memory personal export\`と\`/personal config\`でいつでも可能です。概要は以下の通りです:`,
        next_steps_title: `🟢 私に何ができる？`,
        next_steps_description: `{helpFeatures}で全機能を確認するか、チャットで直接聞いてみてください！使えるスラッシュコマンドも教えられます。`,
        novelai_expressions_warning_field: `⚠️ 表現機能の無効化`,
        novelai_expressions_warning_value: `NovelAIのコンテキストを安定させるため、絵文字とスタンプの使用が自動的に無効化されました。でいつでも再有効化できます。`,
        zai_tos_warning_field: `⚠️ Z.ai利用規約について`,
        zai_tos_warning_value: `Z.aiの利用規約が更新され、コーディング/エージェントのユースケースのみが許可されるようになりました。Z.aiを一般チャットに使用する場合は自己責任となり、規約に違反する可能性があります。`,
        custom_bearer_hint_field: `🔑 Bearerトークン`,
        custom_bearer_hint_value: `エンドポイントに認証が必要な場合は、{apiKeySet}または{providerSwitch}でBearerトークンを追加してください。`,
        preset_field: `人格プリセット`,
        name_field: `私の名前`,
        dm_context_explanation_title: `ダイレクトメッセージについて`,
        dm_context_explanation: `このダイレクトメッセージでも「サーバー」として参照します。つまり、すべての「サーバー」機能が同じように動作しますが、私たちだけのプライベートな空間です！このダイレクトメッセージを私との1対1サーバーと考えてください。「サーバーメモリー」はここでのみの私の記憶です。`,
        already_setup_title: `既に設定済みです`,
        already_setup_description: `このサーバーでは既に設定が完了しています。設定を変更するには、\`/config\`、\`/persona\`、\`/memory\`、\`/server\`などの他のコマンドを使用してください。

				プロバイダーを変更したい場合は、\`/config api-key set\`コマンドを使用してください。`,
      },
      params: {
        description: `AI生成品質のサンプリングパラメーターを調整します。`,
        manage: {
          description: `現在のプロバイダーに送信するサンプリングパラメーターを選びます。`,
          modal_title: `サンプリングパラメーター管理`,
          checkbox_label: `サンプリングパラメーター`,
          checkbox_label_continued: `サンプリングパラメーター（続き）`,
          checkbox_description: `チェック済み = 有効、未チェック = 無効です。有効でもリクエスト時に省略される場合があります。`,
          checkbox_description_anthropic: `チェック済み = 有効、未チェック = 無効です。Anthropic では Temperature と Top-P を同時送信できないため、両方有効な場合は現在 Temperature が送信され、Top-P は省略されます。`,
          option_description_supported: `現在値: {value} ・ {status}`,
          option_description_unsupported: `現在値: {value} ・ {provider} では非対応`,
          state_disabled: `無効`,
          state_enabled_custom: `有効（カスタム値を送信）`,
          state_enabled_default: `有効（{provider} の既定値を使用）`,
          state_enabled_omitted_conflict: `有効（現在は {provider} に送信しません）`,
          no_changes_title: `パラメーター変更なし`,
          no_changes_description: `**{provider}** の送信/省略設定に変更はありませんでした。`,
          success_title: `サンプリングパラメーターを更新しました`,
          success_description: `**{provider}** へ送るサンプリングパラメーターを更新しました。
有効 ({enabled_count}): {enabled_list}
無効 ({omitted_count}): {omitted_list}`,
        },
        temperature: {
          description: `応答の創造性/ランダム性を設定します（0〜2.0、デフォルト: 1.0）。`,
          value_description: `0（決定的）から2.0（非常にランダム）の間の値。デフォルト: 1.0。`,
          invalid_value_title: `無効なTemperature`,
          invalid_value_description: `Temperatureは {min} から {max} の間でなければなりません。`,
          already_set_title: `Temperatureは既に設定済みです`,
          already_set_description: `Temperatureは既に \`{temperature}\` に設定されています。`,
          success_title: `Temperatureが更新されました`,
          success_description: `LLMのTemperatureが \`{previous_temperature}\` から \`{temperature}\` に変更されました。
**対応プロバイダー:** {supported_providers}`,
        },
        "top-p": {
          description: `Top-P（核サンプリング）のしきい値を設定します（デフォルト: 0.95）。`,
          value_description: `サンプリングする確率質量（0.0=非常に制限的、1.0=完全分布）。デフォルト: 0.95。`,
          invalid_value_title: `無効なTop-P値`,
          invalid_value_description: `Top-Pは {min} から {max} の間でなければなりません。`,
          already_set_title: `Top-Pは既に設定済みです`,
          already_set_description: `Top-Pは既に \`{top_p}\` に設定されています。`,
          success_title: `Top-Pが更新されました`,
          success_description: `Top-Pが \`{previous_top_p}\` から \`{top_p}\` に変更されました。
**対応プロバイダー:** {supported_providers}`,
        },
        "top-k": {
          description: `Top-K（候補トークン数）の上限を設定します（デフォルト: 0）。`,
          value_description: `サンプリングするトークン数（0=無効、最大40）。デフォルト: 0。`,
          invalid_value_title: `無効なTop-K値`,
          invalid_value_description: `Top-Kは {min} から {max} の間でなければなりません。`,
          already_set_title: `Top-Kは既に設定済みです`,
          already_set_description: `Top-Kは既に \`{top_k}\` に設定されています。`,
          success_title: `Top-Kが更新されました`,
          success_description: `Top-Kが \`{previous_top_k}\` から \`{top_k}\` に変更されました。
**対応プロバイダー:** {supported_providers}`,
        },
        "frequency-penalty": {
          description: `繰り返しトークンへの頻度ペナルティを設定します（デフォルト: 0.0）。`,
          value_description: `頻出トークンへのペナルティ（-2.0〜2.0、2.0は1.99で保存）。デフォルト: 0.0。`,
          invalid_value_title: `無効なFrequency Penalty`,
          invalid_value_description: `Frequency penaltyは {min} から {max} の間でなければなりません。`,
          already_set_title: `Frequency Penaltyは既に設定済みです`,
          already_set_description: `Frequency penaltyは既に \`{frequency_penalty}\` に設定されています。`,
          success_title: `Frequency Penaltyが更新されました`,
          success_description: `Frequency penaltyが \`{previous_frequency_penalty}\` から \`{frequency_penalty}\` に変更されました。
**対応プロバイダー:** {supported_providers}`,
        },
        "presence-penalty": {
          description: `繰り返しトピックへの存在ペナルティを設定します（デフォルト: 0.0）。`,
          value_description: `既出トピックへのペナルティ（-2.0〜2.0、2.0は1.99で保存）。デフォルト: 0.0。`,
          invalid_value_title: `無効なPresence Penalty`,
          invalid_value_description: `Presence penaltyは {min} から {max} の間でなければなりません。`,
          already_set_title: `Presence Penaltyは既に設定済みです`,
          already_set_description: `Presence penaltyは既に \`{presence_penalty}\` に設定されています。`,
          success_title: `Presence Penaltyが更新されました`,
          success_description: `Presence penaltyが \`{previous_presence_penalty}\` から \`{presence_penalty}\` に変更されました。
**対応プロバイダー:** {supported_providers}`,
        },
        "min-p": {
          description: `Min-P（最小確率）のしきい値を設定します（デフォルト: 0.0）。`,
          value_description: `上位トークンに対する最小トークン確率（0.0=無効、1.0=最も制限的）。デフォルト: 0.0。`,
          invalid_value_title: `無効なMin-P値`,
          invalid_value_description: `Min-Pは {min} から {max} の間でなければなりません。`,
          already_set_title: `Min-Pは既に設定済みです`,
          already_set_description: `Min-Pは既に \`{min_p}\` に設定されています。`,
          success_title: `Min-Pが更新されました`,
          success_description: `Min-Pが \`{previous_min_p}\` から \`{min_p}\` に変更されました。
**対応プロバイダー:** {supported_providers}`,
        },
      },
      "logit-bias": {
        description: `対応モデル向けのlogit bias項目を管理します。`,
        add: {
          description: `共通のbias値で、カンマ区切りのlogit bias項目を追加します。`,
          modal_title: `Logit Biasを追加`,
          terms_label: `単語 / トークンID`,
          terms_description: `カンマ区切りで入力。単語は現在のモデル向けにトークン化され、モデル変更時に再計算されます。例: Sorry, apology, 50256`,
          terms_placeholder: `例: Sorry, apology, 50256`,
          bias_label: `Bias値`,
          bias_description: `-100〜100の数値。例: -100`,
          bias_placeholder: `例: -100`,
          empty_terms_title: `項目がありません`,
          empty_terms_description: `少なくとも1つ、カンマ区切りの単語またはトークンIDを入力してください。`,
          term_too_long_title: `項目が長すぎます`,
          term_too_long_description: `各項目は最大{max_length}文字までです。`,
          invalid_bias_title: `無効なBias値`,
          invalid_bias_description: `Biasは {min} から {max} の数値でなければなりません。`,
          already_set_title: `変更はありません`,
          already_set_description: `入力された項目はすべて、同じbias値で既に保存されています。`,
          success_title: `Logit Biasを更新しました`,
          success_description: `新規 **{added_count}** 件を追加し、既存 **{updated_count}** 件を更新しました。
保存合計: **{total_count}** 件
現在のモデルで実行時に使える項目: **{runtime_ready_count}** 件`,
        },
        remove: {
          description: `保存済みのlogit bias項目を削除します。`,
          clearall_description: `モーダルを開かずに、保存済みのlogit bias項目をすべて削除します。`,
          modal_title: `Logit Biasを削除`,
          checkbox_label: `Logit Bias項目`,
          checkbox_label_continued: `Logit Bias項目（続き）`,
          checkbox_description: `削除したい項目のチェックを外してください。`,
          none_title: `Logit Bias項目はありません`,
          none_description: `このサーバーには保存済みのlogit bias項目がありません。`,
          select_page_title: `Logit Biasページを選択`,
          select_page_description: `このサーバーには保存済みのlogit bias項目が **{total_entries}** 件あり、**{total_pages}** ページに分かれています。編集するページを選んでください。`,
          too_many_title: `Logit Biasページが多すぎます`,
          too_many_description: `このサーバーには保存済みのlogit bias項目が **{total_entries}** 件あり、**{total_pages}** ページに分かれています。現在のページ選択UIは **{max_pages}** ページまで対応しています。`,
          no_removals_title: `削除された項目はありません`,
          no_removals_description: `どの項目も未チェックになっていません。保存済みのlogit bias項目は変更されていません。`,
          success_title: `Logit Bias項目を更新しました`,
          success_description: `**{removed_count}** 件を削除しました。保存済みの項目は **{remaining_count}** 件残っています。`,
          clearall_success_title: `Logit Biasをクリアしました`,
          clearall_success_description: `保存済みのlogit bias項目をすべて削除しました（**{removed_count}** 件）。`,
        },
        upload: {
          description: `SillyTavern形式のlogit bias JSONをアップロードします。`,
          file_description: `text と value フィールドを持つ logit bias オブジェクトの .json ファイル。`,
          invalid_file_title: `無効なファイル`,
          file_too_large_title: `ファイルが大きすぎます`,
          file_too_large_description: `アップロードするファイルは {max_size} MB 以下である必要があります。`,
          download_failed_title: `ダウンロード失敗`,
          download_failed_description: `アップロードされたファイルをダウンロードできませんでした。もう一度お試しください。`,
          invalid_json_title: `無効なJSON`,
          invalid_json_description: `アップロードされたファイルは有効なJSONではありません。`,
          invalid_schema_title: `無効なLogit Bias形式`,
          invalid_schema_description: `\`text\` と \`value\` を持つSillyTavern形式の項目、またはその配列が必要です。Biasは {min} から {max}、text は最大 {max_length} 文字までです。`,
          no_entries_title: `項目が見つかりません`,
          no_entries_description: `アップロードされたファイルには有効なlogit bias項目がありませんでした。`,
          already_set_title: `変更はありません`,
          already_set_description: `アップロードされた項目はすべて、同じbias値で既に保存されています。`,
          success_title: `Logit Biasをインポートしました`,
          success_description: `新規 **{added_count}** 件を追加し、既存 **{updated_count}** 件を更新しました。
保存合計: **{total_count}** 件
現在のモデルで実行時に使える項目: **{runtime_ready_count}** 件`,
        },
      },
      timezone: {
        description: `サーバーのUTCオフセットを設定します（デフォルト: 0 / UTC）。`,
        value_description: `UTCオフセット（時間、デフォルト: 0）。例: 8、-5、0、9`,
        invalid_value_title: `無効なタイムゾーンオフセット`,
        invalid_value_description: `タイムゾーンオフセットは {min} から {max} 時間の間でなければなりません。`,
        already_set_title: `タイムゾーンは既に設定済みです`,
        already_set_description: `タイムゾーンは既に \`{timezone}\` に設定されています。`,
        success_title: `タイムゾーンが更新されました`,
        success_description: `サーバーのタイムゾーンが \`{previous_timezone}\` から \`{timezone}\` に変更されました。`,
      },
      permissions: {
        description: `このサーバーでの私のコアな行動権限を設定します。`,
        selfteaching_option: `自己学習`,
        personalization_option: `パーソナライズ (記憶/ニックネーム)`,
        emojiusage_option: `絵文字の使用`,
        stickerusage_option: `スタンプの使用`,
        websearch_option: `ウェブ検索権限`,
        managemessage_option: `メッセージ管理`,
        imagegen_option: `画像生成`,
        videogen_option: `動画生成`,
        hiderespondembed_option: `応答埋め込みを非表示`,
        hideimpersonationembeds_option: `なりすまし埋め込みを非表示`,
        voicemessage_option: `ボイスメッセージ（ElevenLabs）`,
        selfteaching_desc: `サーバーの会話から学習する`,
        personalization_desc: `個人記憶とニックネーム`,
        emojiusage_desc: `返答に絵文字を使用する`,
        stickerusage_desc: `スタンプを送信する`,
        websearch_desc: `ウェブで情報を検索する`,
        managemessage_desc: `最近のメッセージの固定と、ボットやキャラクター名義の最近のメッセージ編集・削除を許可する`,
        imagegen_desc: `リクエストに応じて画像生成`,
        videogen_desc: `リクエストに応じて短い動画を生成`,
        hiderespondembed_desc: `/bot respond の成功埋め込みを非表示`,
        hideimpersonationembeds_desc: `なりすまし通知を非表示`,
        voicemessage_desc: `ElevenLabs TTSボイスメッセージを送信`,
        select_placeholder: `有効にする権限を選択...`,
        checkbox_label_continued: `権限（続き）`,
        select_embed_title: `権限の設定`,
        select_embed_description: `**有効にする**権限を選択してください。チェックあり = 有効、チェックなし = 無効。`,
        no_changes_title: `変更なし`,
        no_changes_description: `すべての権限はすでに選択した値に設定されています。`,
        success_title: `権限が更新されました`,
        success_description: `**{count}** 件の権限を更新しました。`,
      },
      "system-prompt": {
        description: `人格指示のためのカスタムシステムプロンプトを管理します`,
      },
      prompt: {
        change: {
          command_description: `行動を導くカスタムシステムプロンプトを設定します`,
          modal_title: `カスタムシステムプロンプトを設定`,
          part1_label: `システムプロンプト（1/4）`,
          part1_description: `Discord の 4000 文字制限により、プロンプト入力は 4 つに分割されています。`,
          part1_placeholder: `例：{bot} はフレンドリーで親切...`,
          part2_label: `システムプロンプト（2/4）- 任意`,
          part2_placeholder: `追加の指示...`,
          part3_label: `システムプロンプト（3/4）- 任意`,
          part3_placeholder: `さらに指示...`,
          part4_label: `システムプロンプト（4/4）- 任意`,
          part4_placeholder: `最後の指示...`,
          empty_prompt_title: `空のシステムプロンプト`,
          empty_prompt_description: `システムプロンプトは空にできません。少なくともパート1に指示を入力してください。`,
          success_title: `システムプロンプトが更新されました`,
          success_description: `カスタムシステムプロンプトを設定しました：
\`\`\`
{preview}...
\`\`\``,
        },
        clear: {
          command_description: `カスタムシステムプロンプトを削除してデフォルトプロンプトに戻します`,
          no_custom_prompt_title: `カスタムプロンプトは未設定です`,
          no_custom_prompt_description: `カスタムシステムプロンプトは設定されていません。現在はデフォルトのプロンプトを使用しています：
\`\`\`
{defaultPrompt}
\`\`\``,
          success_title: `システムプロンプトがクリアされました`,
          success_description: `カスタムシステムプロンプトをクリアしました。現在はデフォルトのプロンプトを使用します：
\`\`\`
{defaultPrompt}
\`\`\``,
        },
        preset: {
          command_description: `システムプロンプトのプリセットを適用します`,
          modal_title: `システムプロンプトプリセットを選択`,
          selection_label: `プリセットを選択`,
          selection_placeholder: `プリセットのプロンプトスタイルを選択...`,
          success_title: `✓ プリセットが適用されました`,
          success_description: `システムプロンプトプリセットを適用しました：**{presetName}**
プレビュー：
\`\`\`
{preview}...
\`\`\``,
          no_presets_title: `プリセットがありません`,
          no_presets_description: `システムプロンプトプリセットが見つかりません。ボット管理者にお問い合わせください。`,
          invalid_preset_title: `無効なプリセット`,
          invalid_preset_description: `選択されたプリセットが見つかりませんでした。もう一度お試しください。`,
        },
      },
      "context-note": {
        description: `会話履歴に注入するリマインダーを管理します`,
        set: {
          description: `会話履歴の特定の深さに短いリマインダーを設定します`,
          scope_description: `リマインダーの保存先（特定のペルソナまたはサーバー全体）`,
          persona_option: `ペルソナ（特定のペルソナに紐付け）`,
          global_option: `グローバル（ペルソナに設定がない場合のサーバー全体のフォールバック）`,
          modal_title: `コンテキストリマインダーを設定`,
          text_label: `リマインダー`,
          text_placeholder: `空白にすると削除されます。ドリフトを防ぐために会話履歴に挿入される短いプロンプト。`,
          depth_label: `深さ（0 = 返信に最も近い、最大100）`,
          depth_placeholder: `0 = 最新メッセージの直前`,
          success_set_title: `コンテキストリマインダーを更新しました`,
          success_set_description: `**スコープ：** {scope}
**深さ：** 最下部から {depth} メッセージ
**プレビュー：**
\`\`\`
{preview}
\`\`\``,
          success_removed_title: `コンテキストリマインダーを削除しました`,
          success_removed_description: `**{scope}** のコンテキストリマインダーをクリアしました。`,
          invalid_depth_title: `無効な深さ`,
          invalid_depth_description: `深さは **0** から **100** の整数で指定してください。`,
          no_personas_title: `ペルソナが見つかりません`,
          no_personas_description: `このサーバーにはまだペルソナが設定されていません。先に \`/config setup\` を使用してください。`,
        },
      },
      "random-trigger": {
        add: {
          description: `チャンネルに確率的なタイマーベースの自動トリガーを追加します。`,
          channel_description: `自発的なメッセージを送信するチャンネル。`,
          timer_hours_description: `サイコロを振る頻度（時間単位、最低1時間）。`,
          random_offset_range_description: `タイマーがリセットされるたびに加算/減算するランダムオフセット範囲（時間、任意、最小0）。`,
          chance_description: `各ロールで発火する確率（1〜100%）。`,
          silence_threshold_description: `このX時間以内にチャンネルに活動があった場合はスキップ（任意）。`,
          failure_threshold_description: `連続してサイコロを外れた回数がこの値に達したら強制発火し、カウンターをリセットします（任意）。`,
          modal_title: `ランダムトリガーの設定`,
          persona_select_label: `ペルソナ`,
          persona_select_placeholder: `ペルソナを選択...`,
          persona_random_label: `ランダム（毎回選択）`,
          respond_to_self_label: `自分への返答`,
          respond_to_self_description: `このペルソナが最後に発言した場合でも発火しますか？`,
          respond_to_self_yes: `はい`,
          prompt_label: `カスタムプロンプト（任意）`,
          prompt_description: `このトリガーのメッセージに注入される追加指示。`,
          prompt_placeholder: `例：天気について話題を始めて...`,
          cap_reached_title: `トリガー上限に達しました`,
          cap_reached_description: `このサーバーはランダムトリガーの最大数{max}に達しました。先に1つ削除してください。`,
          override_title: `トリガーが更新されました`,
          override_description: `{channel}の{persona}のトリガーが既に存在していたため、新しい設定で更新されました。`,
          success_title: `ランダムトリガーを追加しました`,
          success_description: `{channel}を**{timer_hours}時間**ごとに確認し、**{chance}%**の確率で**{persona}**として発言します。{offset_suffix}{silence_suffix}{failure_suffix}`,
          success_offset_suffix: ` リセットごとに最大**+/-{random_offset_range}時間**のランダムオフセットを加算/減算します。`,
          success_silence_suffix: ` **{silence_threshold}時間**以内に活動があった場合はスキップします。`,
          success_failure_suffix: ` **{failure_threshold}**回連続でミスした場合に強制発火します。`,
        },
        remove: {
          description: `このサーバーからランダムトリガーを削除します。`,
          modal_title: `ランダムトリガーの削除`,
          checkbox_label: `ランダムトリガー`,
          checkbox_label_continued: `ランダムトリガー（続き）`,
          checkbox_description: `削除したいランダムトリガーのチェックを外してください。`,
          select_label: `削除するトリガー`,
          select_description: `削除するランダムトリガーを選択します。`,
          select_placeholder: `トリガーを選択...`,
          none_title: `トリガーが見つかりません`,
          none_description: `このサーバーにはランダムトリガーが設定されていません。`,
          no_removals_title: `削除されたランダムトリガーはありません`,
          no_removals_description: `どのランダムトリガーも未チェックになっていません。変更は行われていません。`,
          success_title: `ランダムトリガーを更新しました`,
          success_description: `次のランダムトリガーを削除しました。
{triggers_removed}`,
        },
      },
      remove: {
        modeloverride: {
          description: `チャンネルとペルソナのモデル上書きを削除します。`,
          modal_title: `モデル上書きの削除`,
          channel_checkbox_label: `チャンネル上書き`,
          channel_checkbox_label_continued: `チャンネル上書き（続き）`,
          channel_checkbox_description: `削除したいチャンネル上書きのチェックを外してください。`,
          persona_checkbox_label: `ペルソナ上書き`,
          persona_checkbox_label_continued: `ペルソナ上書き（続き）`,
          persona_checkbox_description: `削除したいペルソナ上書きのチェックを外してください。`,
          none_title: `モデル上書きなし`,
          none_description: `このサーバーにはチャンネルまたはペルソナのモデル上書きが設定されていません。`,
          too_many_title: `モデル上書きが多すぎます`,
          too_many_description: `このサーバーにはチャンネル上書きが **{channel_count}** 件、ペルソナ上書きが **{persona_count}** 件（合計 **{total_count}** 件）あります。Discord のモーダルではチェックボックスグループを **{max_groups}** 個（合計 **{max_entries}** 項目）までしか表示できません。`,
          no_removals_title: `削除されたモデル上書きはありません`,
          no_removals_description: `どの上書きも未チェックになっていません。モデル上書きは変更されていません。`,
          success_title: `モデル上書きを更新しました`,
          success_description: `次のモデル上書きを削除しました。
{removed_overrides}`,
        },
        modelfallback: {
          description: `フォールバックチェーンからモデルを削除します。`,
          modal_title: `フォールバックモデルの削除`,
          checkbox_label: `フォールバックモデル`,
          checkbox_description: `削除したいフォールバックモデルのチェックを外してください。チェックしたモデルは現在の順序のまま残ります。`,
          none_title: `フォールバック未設定`,
          none_description: `このサーバーにはフォールバックモデルが設定されていません。`,
          no_removals_title: `削除されたフォールバックモデルはありません`,
          no_removals_description: `どのフォールバックモデルも未チェックになっていません。フォールバックチェーンは変更されていません。`,
          success_title: `フォールバックチェーンを更新しました`,
          success_description: `次のフォールバックモデルを削除しました: {models_removed}
残り{remaining_count}件。`,
        },
      },
      "model-override": {
        description: `チャンネルとペルソナのモデル上書きを管理します。`,
      },
      "model-fallback": {
        description: `フォールバックチェーンのモデルを管理します。`,
      },
      mcp: {
        description: `リモートMCP（Model Context Protocol）ツールサーバーを管理`,
        add: {
          description: `このギルドに新しいリモートMCPサーバーを登録します。/help mcp でセットアップガイドを確認できます。`,
          modal_title: `MCPサーバーを追加`,
          name_label: `サーバー名`,
          name_placeholder: `my-mcp-server`,
          url_label: `サーバーURL`,
          url_placeholder: `https://mcp.example.com/sse`,
          auth_token_label: `認証トークン（任意）`,
          auth_token_placeholder: `BearerトークンまたはSmithery APIキー（不要な場合は空白）`,
          server_type_label: `サーバータイプ（任意）`,
          server_type_description: `このサーバーが置き換える機能（対応する内蔵ツールを無効化）`,
          none_option: `汎用`,
          none_option_description: `内蔵ツールは無効化されません`,
          web_search_option: `ウェブ検索`,
          web_search_option_description: `内蔵のBraveおよびDuckDuckGo検索ツールを無効化`,
          url_fetcher_option: `URL取得`,
          url_fetcher_option_description: `内蔵のURL取得ツールを無効化`,
          invalid_input_title: `入力不足`,
          invalid_input_description: `サーバー名とURLの両方が必要です。`,
          invalid_name_title: `無効なサーバー名`,
          invalid_name_description: `サーバー名は英数字とハイフンのみ使用可能（1〜32文字）で、英数字で始まる必要があります。`,
          invalid_url_title: `無効なURL`,
          invalid_url_invalid_format_description: `MCPサーバーURLの形式が正しくありません。`,
          invalid_url_protocol_description: `MCPサーバーURLはHTTPまたはHTTPSを使用する必要があります。`,
          invalid_url_http_localhost_only_description: `開発環境では、HTTPはlocalhostのMCPサーバーにのみ使用できます。リモートサーバーにはHTTPSを使ってください。`,
          invalid_url_https_required_description: `本番環境ではTLS付きのHTTPS MCPサーバーのみ許可されています。`,
          invalid_url_localhost_blocked_description: `本番環境ではlocalhostのMCPサーバーは使用できません。`,
          invalid_url_dns_failed_description: `ホスト名 \`{hostname}\` をこのサーバーから解決できませんでした。`,
          invalid_url_private_address_description: `本番環境では公開ルーティング可能なMCPホストのみ許可されています。このホスト名はブロック対象アドレス \`{address}\` に解決されました。`,
          limit_reached_title: `サーバー上限に達しました`,
          limit_reached_description: `このギルドはMCPサーバーの上限（{max}台）に達しています。新しいサーバーを追加する前に既存のサーバーを削除してください。`,
          connection_failed_title: `接続失敗`,
          connection_failed_description: `MCPサーバーに接続できませんでした。
**エラー:** {error}`,
          duplicate_name_title: `名前が重複`,
          duplicate_name_description: `"{name}"という名前のMCPサーバーはこのギルドに既に存在します。`,
          success_title: `MCPサーバーを追加しました`,
          success_description: `**{name}**の登録に成功しました。
**URL:** \`{url}\`
**発見されたツール:** {tool_count}件 ({tool_names})

信頼できるMCPサーバーだけを追加してください。
悪意のあるサーバーは、まぎらわしい指示を返したり、ツールに送られた情報を集めたり、危険または誤った結果を返すおそれがあります。`,
        },
        remove: {
          description: `このギルドから登録済みのMCPサーバーを削除します。`,
          modal_title: `MCPサーバーを削除`,
          checkbox_label: `登録済みMCPサーバー`,
          checkbox_label_continued: `登録済みMCPサーバー（続き）`,
          checkbox_description: `削除したいMCPサーバーのチェックを外してください。`,
          too_many_title: `MCPサーバーが多すぎます`,
          too_many_description: `このギルドには登録済みMCPサーバーが **{count}** 台あります。Discord のモーダルではチェックボックスグループを **{max_groups}** 個（合計 **{max_entries}** 項目）までしか表示できません。`,
          no_removals_title: `削除されたMCPサーバーはありません`,
          no_removals_description: `どのMCPサーバーも未チェックになっていません。登録済みサーバーは変更されていません。`,
          success_title: `MCPサーバーを更新しました`,
          success_description: `次のMCPサーバーを削除して切断しました。
{servers_removed}`,
        },
        list: {
          description: `このギルドの登録済みMCPサーバーを一覧表示します。`,
          empty_title: `MCPサーバーなし`,
          empty_description: `このギルドにはMCPサーバーが登録されていません。\`/config mcp add\`で登録してください。`,
          title: `登録済みMCPサーバー`,
          header_description: `**{count}**台のサーバーが登録済み:

{servers}`,
        },
        toggle: {
          description: `登録済みMCPサーバーの有効/無効を切り替えます。`,
          modal_title: `MCPサーバーの切り替え`,
          select_label: `サーバーを選択`,
          select_description: `切り替えるMCPサーバーを選択してください`,
          select_placeholder: `切り替えるサーバーを選択...`,
          state_label: `有効/無効`,
          state_description: `サーバーを有効にするか無効にするかを選択`,
          currently_enabled: `有効`,
          currently_disabled: `無効`,
          enable_option: `有効にする`,
          enable_option_description: `このMCPサーバーをツール呼び出しに有効化`,
          not_found_title: `サーバーが見つかりません`,
          not_found_description: `"{name}"という名前のMCPサーバーはこのギルドに見つかりませんでした。`,
          enabled_success_title: `MCPサーバーを有効化しました`,
          enabled_success_description: `MCPサーバー"{name}"が有効化され、ツール呼び出しに使用可能になりました。`,
          disabled_success_title: `MCPサーバーを無効化しました`,
          disabled_success_description: `MCPサーバー"{name}"が無効化され、切断されました。`,
        },
      },
    },
    "optional-key": {
      description: `オプションのサービスAPIキーを管理`,
      brave: {
        description: `Brave Search APIキーを管理`,
        set: {
          description: `このサーバーのBrave Search APIキーを設定します。`,
          key_description: `あなたのBrave Search APIキー。`,
          invalid_key_title: `無効なAPIキー形式`,
          invalid_key_description: `提供されたAPIキーは短すぎるか無効のようです。有効なキーを提供してください。`,
          key_validation_failed_title: `Brave APIキーの検証に失敗しました`,
          key_validation_failed_description: `提供されたBrave Search APIキーは無効です。キーを確認してもう一度お試しください。`,
          success_title: `Brave APIキーが設定されました`,
          success_description: `Brave Search APIキーが正常に検証、暗号化、保存されました。

⚠️ **重要：** Braveでは毎月5ドル分の無料クレジットが提供され、それを超えると課金されます。予期しない課金を防ぐため、[Braveの使用量上限ダッシュボード](https://api-dashboard.search.brave.com/app/subscriptions/usage-limits)で使用量上限を5ドルに設定してください。`,
        },
        remove: {
          description: `現在設定されているBrave Search APIキーを削除します。`,
          no_key_title: `Brave APIキーが設定されていません`,
          no_key_description: `現在削除するBrave Search APIキーが設定されていません。`,
          success_title: `Brave APIキーが削除されました`,
          success_description: `Brave Search APIキーが正常に削除されました。`,
        },
      },
      google: {
        description: `補助Google APIキーを管理（画像インペインティング用）`,
        set: {
          description: `画像セグメンテーション用Google APIキー。Googleがメインプロバイダーの場合は不要。`,
          key_description: `あなたのGoogle APIキー。`,
          invalid_key_title: `無効なAPIキー形式`,
          invalid_key_description: `提供されたAPIキーは短すぎるか無効のようです。有効なGoogle APIキーを提供してください。`,
          key_validation_failed_title: `Google APIキーの検証に失敗しました`,
          key_validation_failed_description: `提供されたGoogle APIキーは無効です。キーを確認してもう一度お試しください。`,
          success_title: `Google APIキーが設定されました`,
          success_description: `Google APIキーが正常に検証、暗号化、保存されました。AIの画像セグメンテーション（インペインティング）に使用されます。メインプロバイダーがすでにGoogleの場合、このキーがセグメンテーションで優先されます。`,
        },
        remove: {
          description: `現在設定されているGoogle APIキーを削除します。`,
          no_key_title: `Google APIキーが設定されていません`,
          no_key_description: `現在削除するGoogle APIキーが設定されていません。`,
          success_title: `Google APIキーが削除されました`,
          success_description: `Google APIキーが正常に削除されました。`,
        },
      },
      novelai: {
        description: `補助NovelAI APIキーを管理（画像生成用）`,
        set: {
          description: `画像生成用NovelAI APIキー。NovelAIがメインプロバイダーの場合は不要。`,
          key_description: `あなたのNovelAI APIキー。`,
          disable_other_imggen_description: `trueの場合、標準の画像生成ツールを非表示にし、NovelAI画像生成のみを利用可能にします。`,
          invalid_key_title: `無効なAPIキー形式`,
          invalid_key_description: `提供されたAPIキーは短すぎるか無効のようです。有効なNovelAI APIキーを提供してください。`,
          key_validation_failed_title: `NovelAI APIキーの検証に失敗しました`,
          key_validation_failed_description: `提供されたNovelAI APIキーは無効です。キーを確認し、有効なサブスクリプションがあることを確認してください。`,
          success_title: `NovelAI APIキーが設定されました`,
          success_description: `NovelAI APIキーが正常に検証、暗号化、保存されました。アクティブなLLMプロバイダーに関係なく、NovelAI画像生成が利用可能になりました。`,
          success_exclusive_description: `NovelAI APIキーが正常に検証、暗号化、保存されました。NovelAI画像生成がこのサーバーの唯一の画像生成ツールになりました。`,
        },
        remove: {
          description: `現在設定されているNovelAI APIキーを削除します。`,
          no_key_title: `NovelAI APIキーが設定されていません`,
          no_key_description: `現在削除するNovelAI APIキーが設定されていません。`,
          success_title: `NovelAI APIキーが削除されました`,
          success_description: `NovelAI APIキーと排他的画像生成設定が削除されました。`,
        },
      },
      elevenlabs: {
        description: `補助ElevenLabs APIキーを管理（音声認識・音声出力用）`,
        set: {
          description: `音声文字起こしとペルソナの音声出力に使うElevenLabs APIキーを設定します。`,
          key_description: `あなたのElevenLabs APIキー。`,
          invalid_key_title: `無効なAPIキー形式`,
          invalid_key_description: `提供されたAPIキーは短すぎるか無効のようです。有効なElevenLabs APIキーを入力してください。`,
          key_validation_failed_title: `ElevenLabs APIキーの検証に失敗しました`,
          key_validation_failed_description: `提供されたElevenLabs APIキーは無効です。キーを確認してもう一度お試しください。`,
          success_title: `ElevenLabs APIキーが設定されました`,
          success_description: `ElevenLabs APIキーが正常に検証、暗号化、保存されました。設定されている場所では音声文字起こしとペルソナの音声出力が利用可能になります。`,
          success_voices_title: `プリメイド音声（無料プラン対応）`,
          success_voices_description: `プリメイド音声は無料プランでも利用できます。一覧は [ElevenLabs Premade Voices](https://elevenlabs-sdk.mintlify.app/voices/premade-voices) で確認し、{configVoiceElevenlabs} で各ペルソナに割り当てましょう。`,
          success_custom_voices_title: `ライブラリ音声・カスタム音声（有料プラン必須）`,
          success_custom_voices_description: `ライブラリ音声とカスタム（クローン・生成）音声はどちらもElevenLabsの有料プランが必要です。アカウントに追加した音声は {configVoiceElevenlabs} に自動で表示されます。`,
          success_transcript_mode_title: `音声トランスクリプトモード`,
          success_transcript_mode_description: `{configVoiceTranscripts} を使うと、音声メッセージのトランスクリプトをWebhook経由でチャットメッセージとして投稿できます。再処理クレジットの節約と透明性の向上に役立ちます。`,
        },
        remove: {
          description: `現在設定されているElevenLabs APIキーを削除します。`,
          no_key_title: `ElevenLabs APIキーが設定されていません`,
          no_key_description: `現在削除するElevenLabs APIキーは設定されていません。`,
          success_title: `ElevenLabs APIキーが削除されました`,
          success_description: `ElevenLabs APIキーが正常に削除されました。`,
        },
      },
    },
    server: {
      config: {
        description: `サーバー設定データを管理します。`,
        export: {
          description: `このサーバーの設定をJSONでエクスポートします。`,
        },
        import: {
          description: `このサーバーの設定をJSONからインポートします。`,
          file_description: `サーバー設定のJSONファイル。`,
          confirmation_description: `警告：インポートするファイルの内容に応じて、既存のサーバー設定が置き換えられる場合があります。続行しますか？`,
          confirmation_choice_yes: `はい、インポートする`,
          confirmation_choice_no: `いいえ、キャンセル`,
        },
        remove: {
          description: `このサーバーの設定をリセットします。`,
          confirmation_description: `このサーバーの設定をリセットしてよいか確認します。`,
          confirmation_choice_yes: `はい、リセットする`,
          confirmation_choice_no: `いいえ、キャンセル`,
        },
      },
      stm: {
        description: `全ペルソナのサーバー共有STMを管理`,
        "privacy-bypass": {
          description: `プライベートチャンネルのSTMが非プライベートチャンネルに漏れるかどうかを切り替えます。`,
          enabled_title: `STMプライバシーバイパス有効`,
          enabled_description: `プライベートチャンネルのSTMが非プライベートチャンネルにも表示されるようになりました。隔離ガードが解除されています。`,
          disabled_title: `STMプライバシーバイパス無効`,
          disabled_description: `プライベートチャンネルのSTMは再び隔離され、そのチャンネル外には表示されなくなりました。`,
        },
        manage: {
          description: `各ペルソナの有効なサーバー共有STMを確認してクリアします。`,
          modal_title: `有効なサーバーSTMを管理`,
          checkbox_label: `有効なSTM`,
          checkbox_label_continued: `有効なSTM（続き）`,
          checkbox_description: `このサーバーからクリアしたいSTMのチェックを外してください。`,
          none_title: `有効なSTMはありません`,
          none_description: `現在、このサーバーには有効なサーバー共有STMがありません。`,
          too_many_title: `有効なSTMが多すぎます`,
          too_many_description: `このサーバーには現在 **{count}** 件の有効なSTMがあります。Discordのモーダルではチェックボックスグループを **{max_groups}** 個まで（合計 **{max_entries}** 件まで）しか表示できません。`,
          no_changes_title: `STMはクリアされませんでした`,
          no_changes_description: `すべてのSTMがチェックされたままだったため、クリアされた項目はありません。`,
          success_title: `サーバーSTMをクリアしました`,
          success_description: `サーバー共有STMを **{cleared_count}** 件クリアしました:
{cleared_entries}`,
          unscoped_label: `未分類STM`,
          no_summary: `要約なし`,
          more_cleared: `- ...他 {count} 件`,
        },
      },
      "private-channels": {
        description: `STMを隔離し、思考ログを抑制するプライベートチャンネルを管理します`,
        modal_title: `プライベートチャンネルを管理`,
        checkbox_label: `プライベートチャンネル`,
        checkbox_label_continued: `プライベートチャンネル（続き）`,
        checkbox_description: `チェックしたチャンネルはプライベートのままです。外したチャンネルはプライベート設定から外れます。`,
        no_channels_title: `対象チャンネルはありません`,
        no_channels_description: `このサーバーには管理できるテキストチャンネルがありません。`,
        select_page_title: `プライベートチャンネルを管理`,
        select_page_description: `このサーバーには対象テキストチャンネルが **{channel_count}** 件あり、**{total_pages}** ページに分かれています。
現在プライベート: **{selected_count}**。`,
        done_button: `完了`,
        too_many_pages_title: `チャンネルが多すぎます`,
        too_many_pages_description: `このサーバーには対象テキストチャンネルが **{channel_count}** 件あります。このチェックリスト操作は1回につき **{max_pages}** ページまで対応します。`,
        no_changes_title: `プライベートチャンネルの変更はありません`,
        no_changes_description: `プライベートチャンネル設定は変更されませんでした。`,
        success_title: `プライベートチャンネルを更新しました`,
        success_description: `プライベート設定を有効化したチャンネル **{enabled_count}** 件: {enabled_channels}
プライベート設定を無効化したチャンネル **{disabled_count}** 件: {disabled_channels}
現在 **{selected_count}** 件のチャンネルがプライベートです。`,
      },
      "crosschannel-blocklist": {
        description: `ツールによるクロスチャンネル送信のチャンネルブロックリストを管理`,
        modal_title: `クロスチャンネルブロックリスト`,
        checkbox_label: `ブロック対象チャンネル`,
        checkbox_label_continued: `ブロック対象チャンネル（続き）`,
        checkbox_description: `チェックしたチャンネルにはツールによるクロスチャンネル送信を行えません。`,
        option_description_category: `カテゴリ: {category_name}`,
        channel_label_forum: `{channel_name} [フォーラム]`,
        channel_label_media: `{channel_name} [メディア]`,
        no_channels_title: `対象チャンネルはありません`,
        no_channels_description: `このサーバーには管理できるテキスト、告知、フォーラム、メディアチャンネルがありません。`,
        select_page_title: `クロスチャンネルブロックリストを管理`,
        select_page_description: `このサーバーには対象チャンネルが **{channel_count}** 件あり、**{total_pages}** ページに分かれています。
現在ブロック中: **{blocked_count}**。
確認したいページを選ぶか、完了したら「完了」を押してください。`,
        done_button: `完了`,
        too_many_pages_title: `チャンネルが多すぎます`,
        too_many_pages_description: `このサーバーには対象チャンネルが **{channel_count}** 件あります。このチェックリスト操作は1回につき **{max_pages}** ページまで対応します。`,
        no_changes_title: `ブロックリストの変更はありません`,
        no_changes_description: `クロスチャンネルブロックリストは変更されませんでした。`,
        success_title: `クロスチャンネルブロックリストを更新しました`,
        success_description: `ブロックを有効化したチャンネル **{enabled_count}** 件: {enabled_channels}
ブロックを無効化したチャンネル **{disabled_count}** 件: {disabled_channels}
現在 **{blocked_count}** 件のチャンネルがブロックされています。`,
      },
      "rp-channels": {
        description: `絵文字とスタンプを常に抑制するRPチャンネルを管理します`,
        modal_title: `RPチャンネルを管理`,
        checkbox_label: `RPチャンネル`,
        checkbox_label_continued: `RPチャンネル（続き）`,
        checkbox_description: `チェックしたチャンネルはRPチャンネルのままです。外したチャンネルはRP設定から外れます。`,
        no_channels_title: `対象チャンネルはありません`,
        no_channels_description: `このサーバーには管理できるテキストチャンネルがありません。`,
        select_page_title: `RPチャンネルを管理`,
        select_page_description: `このサーバーには対象テキストチャンネルが **{channel_count}** 件あり、**{total_pages}** ページに分かれています。
現在RP設定中: **{selected_count}**。`,
        done_button: `完了`,
        too_many_pages_title: `チャンネルが多すぎます`,
        too_many_pages_description: `このサーバーには対象テキストチャンネルが **{channel_count}** 件あります。このチェックリスト操作は1回につき **{max_pages}** ページまで対応します。`,
        no_changes_title: `RPチャンネルの変更はありません`,
        no_changes_description: `RPチャンネル設定は変更されませんでした。`,
        success_title: `RPチャンネルを更新しました`,
        success_description: `RP設定を有効化したチャンネル **{enabled_count}** 件: {enabled_channels}
RP設定を無効化したチャンネル **{disabled_count}** 件: {disabled_channels}
現在 **{selected_count}** 件のチャンネルがRP設定中です。`,
      },
      "auto-trigger": {
        description: `自動チャット設定を管理`,
        channels: {
          description: `私が自動的にチャットするチャンネルの保存済みセットを管理するか、1つのチャンネルに使うペルソナを設定します。`,
          channel_description: `設定したい単一のテキストチャンネルです。空欄なら一括チェックリストを開きます。`,
          modal_title: `自動トリガーチャンネルを管理`,
          checkbox_label: `自動トリガーチャンネル`,
          checkbox_label_continued: `自動トリガーチャンネル（続き）`,
          checkbox_description: `チェックしたチャンネルは自動トリガー対象のままです。外したチャンネルは対象外になります。`,
          single_modal_title: `自動トリガーチャンネルを設定`,
          single_enabled_label: `自動トリガーを有効化`,
          single_enabled_description: `このチャンネルで自動トリガーを有効または無効にします。`,
          single_persona_label: `自動トリガーペルソナ`,
          single_persona_description: `このチャンネルで自動トリガーとチャンネル限定の常時応答に使うペルソナを選択します。`,
          single_persona_placeholder: `現在: {persona}`,
          main_persona_description: `メインペルソナ`,
          alter_persona_description: `オルタペルソナ`,
          no_channels_title: `対象チャンネルはありません`,
          no_channels_description: `このサーバーには管理できるテキストチャンネルがありません。`,
          invalid_channel_title: `無効なチャンネル`,
          invalid_channel_description: `自動トリガーに使えるサーバーのテキストチャンネルを選択してください。`,
          select_page_title: `自動トリガーチャンネルを管理`,
          select_page_description: `このサーバーには対象テキストチャンネルが **{channel_count}** 件あり、**{total_pages}** ページに分かれています。
現在有効: **{selected_count}**。`,
          done_button: `完了`,
          too_many_pages_title: `チャンネルが多すぎます`,
          too_many_pages_description: `このサーバーには対象テキストチャンネルが **{channel_count}** 件あります。このチェックリスト操作は1回につき **{max_pages}** ページまで対応します。`,
          no_changes_title: `自動トリガーチャンネルの変更はありません`,
          no_changes_description: `自動トリガーチャンネル設定は変更されませんでした。`,
          success_title: `自動トリガーチャンネルを更新しました`,
          success_description: `自動トリガーを有効化したチャンネル **{enabled_count}** 件: {enabled_channels}
自動トリガーを無効化したチャンネル **{disabled_count}** 件: {disabled_channels}
現在 **{selected_count}** 件のチャンネルが有効です。`,
          single_success_title: `自動トリガーチャンネルを更新しました`,
          single_success_enabled_description: `{channel} で自動トリガーを有効化し、**{persona}** を使うようにしました。`,
          single_success_disabled_description: `{channel} での自動トリガーを無効化しました。`,
        },
        threshold: {
          description: `設定済みの自動チャットチャンネル用の共有自動チャット範囲を設定します。`,
          threshold_description: `自動チャットまでの最小メッセージ数。0 で常時応答モードになります。`,
          max_description: `自動チャットまでの任意の最大メッセージ数。空欄なら最小値と同じになります。`,
          invalid_range_title: `無効な閾値`,
          invalid_range_specific_description: `常時応答モードには \`{always}\` を使用してください。それ以外は、両方の値を \`{min}\` から \`{max}\` の間にし、最大値を最小値以上にしてください。`,
          success_title: `自動チャット閾値が設定されました`,
          success_description: `指定されたチャンネルで \`{threshold}\` メッセージ後に自動的にチャットします。`,
          success_range_title: `自動チャット範囲が設定されました`,
          success_range_description: `指定されたチャンネルで、\`{min}\` から \`{max}\` メッセージのランダムな間隔で自動的にチャットします。`,
          success_always_title: `自動チャット常時応答モードを設定しました`,
          success_always_description: `自動チャットの閾値を \`{threshold}\` に設定しました。設定済みの自動チャットチャンネルでは、対象メッセージに対して常時応答のように動作します。無効化したい場合はそのチャンネルをリストから削除してください。`,
        },
      },
      trigger: {
        description: `トリガーワードを管理`,
        add: {
          description: `ペルソナのトリガーワードを追加します。`,
          modal_title: `トリガーワードを追加`,
          persona_select_label: `ペルソナ`,
          persona_select_description: `追加先のペルソナを選択してください。`,
          persona_select_placeholder: `ペルソナを選択...`,
          triggers_input_label: `トリガーワード`,
          triggers_input_description: `カンマ区切りで入力してください（"," または "、"）。`,
          triggers_input_placeholder: `例: ともり, トモリ`,
          main_persona_description: `メインペルソナ`,
          alter_persona_description: `オルタペルソナ`,
          no_triggers_title: `トリガーワードがありません`,
          no_triggers_description: `少なくとも1つのトリガーワードを入力してください。`,
          too_short_title: `トリガーワードが短すぎます`,
          too_short_description: `トリガーワードは少なくとも2文字以上である必要があります。`,
          content_too_long_title: `トリガーワードが長すぎます`,
          content_too_long_description: `トリガーワードは {max_length} 文字を超えることはできません。`,
          already_exists_title: `トリガーワードが存在します`,
          already_exists_description: `単語 \`{word}\` は既にトリガーリストにあります。`,
          already_exists_multiple_description: `これらのトリガーワードは既に存在します: {words}。`,
          limit_exceeded_title: `トリガーワード上限に達しました`,
          limit_exceeded_description: `このサーバーはトリガーワードを最大 {max_allowed} 個まで設定できます（現在 {current_count} 個）。新しいものを追加する前に、\`/server trigger remove\`でいくつかのトリガーワードを削除してください。`,
          success_title: `トリガーワードが追加されました`,
          success_description: `{persona_name} に {added_count} 個のトリガーワードを追加しました: {added_words}。現在 {word_count} 個のトリガーワードがあります。`,
        },
        remove: {
          description: `言及されたときに私が応答する単語を削除します。`,
          no_triggers_title: `トリガーワードがありません`,
          no_triggers_description: `削除するカスタムトリガーワードが設定されていません。\`/server trigger add\`で追加してください。`,
          select_description: `削除したいトリガーワードを選択してください`,
          modal_title: `トリガーワードの削除`,
          checkbox_label: `トリガーワード`,
          checkbox_label_continued: `トリガーワード（続き）`,
          checkbox_description: `削除したいトリガーワードのチェックを外してください。`,
          select_label: `トリガーワード`,
          select_placeholder: `削除するトリガーワードを選択してください`,
          no_removals_title: `削除されたトリガーワードはありません`,
          no_removals_description: `どのトリガーワードも未チェックになっていません。変更は行われていません。`,
          success_title: `トリガーワードを更新しました`,
          success_description: `次のトリガーワードを削除しました: {triggerWords}`,
        },
      },
      "user-blacklist": {
        description: `このサーバーのパーソナライズ用ブラックリストを管理します。`,
        add: {
          description: `メンバーをパーソナライズのブラックリストに追加します。`,
          member_description: `ブラックリストに追加するメンバー。`,
          personalization_disabled_title: `パーソナライズが無効です`,
          personalization_disabled_description: `現在、サーバー全体でパーソナライズが無効になっています。まず \`/config bot-permissions\` で有効にしてください。`,
          already_blacklisted_title: `既にブラックリストに登録されています`,
          already_blacklisted_description: `\`{user_name}\` は既にパーソナライズのブラックリストに登録されています。`,
          cannot_blacklist_bot_title: `ボットをブラックリスト登録できません`,
          cannot_blacklist_bot_description: `\`{user_name}\` はボットであり、パーソナライズのブラックリストに追加できません。`,
          success_title: `メンバーがブラックリストに登録されました`,
          success_description: `\`{user_name}\` をパーソナライズのブラックリストに追加しました。彼らの個人的な記憶とニックネームは使用されません。`,
        },
        remove: {
          description: `現在ブラックリスト中のメンバーを確認し、解除したいもののチェックを外します。`,
          none_title: `ブラックリスト中のメンバーはいません`,
          none_description: `現在管理するブラックリスト登録メンバーはいません。`,
          modal_title: `ユーザーブラックリストを管理`,
          checkbox_label: `ブラックリスト中のメンバー`,
          checkbox_label_continued: `ブラックリスト中のメンバー（続き）`,
          checkbox_description: `チェックしたメンバーはブラックリストのままです。外したメンバーはブラックリストから解除されます。`,
          select_page_title: `ユーザーブラックリストを管理`,
          select_page_description: `このサーバーにはブラックリスト登録メンバーが **{user_count}** 人おり、**{total_pages}** ページに分かれています。
現在ブラックリスト中: **{selected_count}**。`,
          done_button: `完了`,
          too_many_pages_title: `ブラックリスト登録メンバーが多すぎます`,
          too_many_pages_description: `このサーバーにはブラックリスト登録メンバーが **{user_count}** 人います。このチェックリスト操作は1回につき **{max_pages}** ページまで対応します。`,
          no_changes_title: `ブラックリストの変更はありません`,
          no_changes_description: `ユーザーブラックリストは変更されませんでした。`,
          success_title: `ユーザーブラックリストを更新しました`,
          success_description: `ブラックリストから **{removed_count}** 人を解除しました: {removed_users}
現在 **{selected_count}** 人がブラックリスト中です。`,
        },
      },
      "welcome-channel": {
        description: `新規メンバー向けの自動歓迎メッセージ設定を管理します。`,
        shared: {
          modal_title: `歓迎メッセージを設定`,
          persona_select_label: `歓迎ペルソナ`,
          persona_select_description: `新規メンバーを歓迎するペルソナを選択します。ランダムは参加ごとに選びます。`,
          persona_select_placeholder: `ペルソナを選択...`,
          persona_random_label: `ランダム（参加ごとに選択）`,
          main_persona_description: `メインペルソナ`,
          alter_persona_description: `オルタペルソナ`,
          prompt_label: `追加プロンプト`,
          prompt_description: `新しいユーザーをどのように歓迎しますか？`,
          prompt_placeholder: `新しいユーザーを歓迎する方法を入力...`,
          empty_prompt_title: `追加プロンプトが必要です`,
          empty_prompt_description: `新しいユーザーをどのように歓迎するか入力してください。`,
        },
        set: {
          description: `自動歓迎メッセージを送るチャンネルを設定します。`,
          channel_description: `新規メンバーを歓迎するテキストチャンネル。`,
          success_title: `歓迎チャンネルを更新しました`,
          success_description: `今後、新規メンバーを {channel} で **{persona}** として歓迎します。`,
        },
        remove: {
          description: `設定済みの歓迎チャンネルを削除し、自動歓迎を停止します。`,
          success_title: `歓迎チャンネルを削除しました`,
          success_description: `新規メンバー向けの自動歓迎メッセージは送信しなくなります。`,
          not_configured_title: `歓迎チャンネルは未設定です`,
          not_configured_description: `このサーバーには現在歓迎チャンネルが設定されていません。`,
        },
      },
      "thought-logs-channel": {
        description: `このサーバーの思考ログチャンネルを設定または解除します。`,
        channel_description: `推論サマリーを投稿するテキストチャンネルです。同じチャンネルをもう一度選ぶと無効化されます。`,
        invalid_channel_title: `無効なチャンネル`,
        invalid_channel_description: `サーバーのテキストチャンネルを選択してください。`,
        set_title: `思考ログを有効化しました`,
        set_description: `今後、思考ログは {channel} に投稿されます。`,
        updated_title: `思考ログを更新しました`,
        updated_description: `今後、思考ログは {channel} に投稿されます。`,
        cleared_title: `思考ログを無効化しました`,
        cleared_description: `今後、思考ログは投稿されません。`,
      },
      whitelist: {
        description: `トリガーホワイトリストを管理（チャンネル、チャンネル別ペルソナ、ロール。チャンネル設定はグローバルクールダウンを上書き）`,
        channel: {
          description: `チャンネルをホワイトリストに追加し、必要ならグローバルクールダウンを上書き`,
          channel_description: `ホワイトリストに追加するチャンネル`,
          type_description: `任意の上書き: このチャンネルのクールダウンタイプ`,
          length_description: `任意の上書き: クールダウンの長さ（秒）（0 = 即座、クールダウンなし）`,
          invalid_channel_title: `無効なチャンネルタイプ`,
          invalid_channel_description: `テキストチャンネルのみをホワイトリストに追加できます。`,
          already_set_title: `既に設定されています`,
          already_set_description: `チャンネル **{channel_name}** には既にこれらの正確なホワイトリスト設定があります。`,
          invalid_type_title: `無効なクールダウンタイプ`,
          invalid_type_description: `選択されたクールダウンタイプは無効です。有効なオプションを選択してください。`,
          invalid_length_title: `無効なクールダウンの長さ`,
          invalid_length_description: `クールダウンの長さは **{min}** ～ **{max}** 秒の間である必要があります。`,
          success_inherit_title: `チャンネルがホワイトリストに登録されました`,
          success_inherit_description: `チャンネル **{channel_name}** をホワイトリストに登録し、このサーバーのグローバルクールダウンを継承するように設定しました。

**注意:** いずれかのチャンネルがホワイトリストに登録されると、ホワイトリストに登録されたチャンネルのみがボットをトリガーできます。`,
          success_title: `チャンネルがホワイトリストに登録されました`,
          success_description: `チャンネル **{channel_name}** を、チャンネル固有の **{cooldown_type}** クールダウン（**{cooldown_length}** 秒）でホワイトリストに登録しました。

**注意:** いずれかのチャンネルがホワイトリストに登録されると、ホワイトリストに登録されたチャンネルのみがボットをトリガーできます。`,
          success_instant_title: `チャンネルがホワイトリストに登録されました（即座）`,
          success_instant_description: `チャンネル **{channel_name}** を、チャンネル固有の **{cooldown_type}** 上書き（0秒 = 即座、クールダウンなし）でホワイトリストに登録しました。

**注意:** いずれかのチャンネルがホワイトリストに登録されると、ホワイトリストに登録されたチャンネルのみがボットをトリガーできます。`,
        },
        persona: {
          description: `選択したチャンネルでトリガーできるペルソナを制限`,
          channel_description: `ペルソナホワイトリストを編集するチャンネル`,
          modal_title: `ペルソナをホワイトリスト`,
          checkbox_label: `ホワイトリスト中のペルソナ`,
          checkbox_label_continued: `ホワイトリスト中のペルソナ（続き）`,
          checkbox_description: `このチャンネルで応答できるペルソナにチェックを入れてください。全員をチェックしたままにすると、このチャンネル固有のペルソナホワイトリストは解除されます。`,
          invalid_channel_title: `無効なチャンネルタイプ`,
          invalid_channel_description: `ペルソナホワイトリストを設定できるのはテキストチャンネルのみです。`,
          no_personas_title: `ペルソナがありません`,
          no_personas_description: `このサーバーにはホワイトリスト設定できるペルソナがまだありません。`,
          too_many_personas_title: `ペルソナが多すぎます`,
          too_many_personas_description: `このサーバーには **{persona_count}** 件のペルソナがあります。Discord のモーダルではチェックボックスグループを **{max_groups}** 個（合計 **{max_entries}** 項目）までしか表示できません。`,
          no_personas_selected_title: `ペルソナが選択されていません`,
          no_personas_selected_description: `少なくとも1つのペルソナを選択してください。このチャンネルのペルソナホワイトリストを解除したい場合は、すべてのペルソナをチェックしたままにしてください。`,
          already_set_title: `既に設定されています`,
          already_set_description: `チャンネル **{channel_name}** には既にこのペルソナホワイトリストが設定されています。`,
          success_title: `ペルソナホワイトリストを更新しました`,
          success_description: `今後、**{channel_name}** では {persona_names} のみがトリガーできます。`,
          success_clear_title: `ペルソナホワイトリストを解除しました`,
          success_clear_description: `チャンネル **{channel_name}** のチャンネル固有ペルソナホワイトリストを解除しました。今後は全ペルソナが再びトリガーできます。`,
          main_persona_description: `メインペルソナ`,
          alter_persona_description: `オルタペルソナ`,
        },
        role: {
          description: `ボットをトリガーできるロールホワイトリストを追加・削除`,
          role_description: `ホワイトリストに追加または削除するロール`,
          action_description: `このロールを追加するか削除するか選択`,
          action_add: `追加`,
          action_remove: `削除`,
          invalid_role_title: `無効なロール`,
          invalid_role_description: `@everyone ロールはロールホワイトリストに使用できません。`,
          already_set_title: `既に設定されています`,
          already_set_description: `ロール {role_mention} は既にホワイトリストに登録されています。`,
          not_set_title: `未設定`,
          not_set_description: `ロール {role_mention} はホワイトリストに登録されていません。`,
          success_add_title: `ロールがホワイトリストに登録されました`,
          success_add_description: `ロール {role_mention} は、ロールホワイトリストが有効なときにボットをトリガーできるようになりました。`,
          success_remove_title: `ロールがホワイトリストから削除されました`,
          success_remove_description: `ロール {role_mention} をホワイトリストから削除しました。`,
        },
        remove: {
          description: `ホワイトリストからペルソナ、チャンネル、またはロールを削除`,
          modal_title: `ホワイトリスト項目を削除`,
          persona_checkbox_label: `ホワイトリスト中のペルソナ`,
          persona_checkbox_label_continued: `ホワイトリスト中のペルソナ（続き）`,
          persona_checkbox_description: `削除したいペルソナホワイトリスト項目のチェックを外してください。`,
          checkbox_label: `ホワイトリスト中のチャンネル`,
          checkbox_label_continued: `ホワイトリスト中のチャンネル（続き）`,
          checkbox_description: `ホワイトリストから外したいチャンネルのチェックを外してください。`,
          role_checkbox_label: `ホワイトリスト中のロール`,
          role_checkbox_label_continued: `ホワイトリスト中のロール（続き）`,
          role_checkbox_description: `ホワイトリストから外したいロールのチェックを外してください。`,
          no_entries_title: `ホワイトリスト項目がありません`,
          no_entries_description: `削除するホワイトリスト中のペルソナ、チャンネル、またはロールがありません。`,
          too_many_entries_title: `ホワイトリスト項目が多すぎます`,
          too_many_entries_description: `このサーバーにはホワイトリスト中のペルソナが **{persona_count}** 件、チャンネルが **{channel_count}** 件、ロールが **{role_count}** 件あります。Discord のモーダルではチェックボックスグループを **{max_groups}** 個（合計 **{max_entries}** 項目）までしか表示できません。`,
          no_removals_title: `削除されたホワイトリスト項目はありません`,
          no_removals_description: `どのホワイトリスト項目も未チェックになっていません。変更は行われていません。`,
          success_title: `ホワイトリストを更新しました`,
          success_description: `次のホワイトリスト項目を削除しました。
**ペルソナ:** {personas_removed}
**チャンネル:** {channels_removed}
**ロール:** {roles_removed}`,
        },
      },
      cooldown: {
        description: `クールダウンの管理`,
        triggers: {
          description: `トリガーと /bot のクールダウンを設定します（デフォルト: オフ、5秒）。`,
          cooldown_type_description: `クールダウン適用方法（デフォルト: オフ、ユーザーごと等）。`,
          cooldown_length_description: `クールダウン時間（秒、1-86400、デフォルト: 5）。`,
          invalid_type_title: `無効なクールダウンタイプ`,
          invalid_type_description: `選択されたクールダウンタイプが無効です。有効なオプションを選択してください。`,
          invalid_length_title: `無効な時間`,
          invalid_length_description: `時間は {min} から {max} 秒（24時間）の間で指定してください。`,
          already_set_title: `既に設定済み`,
          already_set_description: `クールダウン設定は既に **{type}**（**{length}** 秒）です。`,
          success_title: `クールダウンを更新しました`,
          success_description: `クールダウンを **{previous_type}**（**{previous_length}** 秒）から **{type}**（**{length}** 秒）に更新しました。これはメッセージトリガーと \`/bot\` コマンドの両方に適用されます。`,
          success_disabled_title: `クールダウンが無効化されました`,
          success_disabled_description: `クールダウンを **{previous_type}**（**{previous_length}** 秒）から **{type}**（**{length}** 秒）に更新しました。メッセージトリガーと \`/bot\` コマンドのクールダウンは現在 **無効** です。`,
          type: {
            choice_off: `オフ`,
            choice_per_user: `ユーザーごと`,
            choice_per_channel: `チャンネルごと`,
            choice_server_wide: `サーバー全体`,
            choice_strict_server_wide: `厳密サーバー全体`,
          },
        },
      },
      quota: {
        description: `生成クォータを管理`,
        imagegen: {
          description: `このサーバーの日次画像生成クォータを設定します。`,
          unlimited: `無制限`,
          daily_user_quota_limit_description: `ユーザー1人あたりの日次画像数（0=無制限、1-100、デフォルト: 10）。`,
          daily_user_quota_success_title: `ユーザークォータが更新されました`,
          daily_user_quota_success_description: `ユーザークォータが1日あたり **{limit}** 枚の画像に設定されました。`,
          serverwide_quota_limit_description: `サーバー全体の画像数（0=無制限、1-99999、デフォルト: 0）。`,
          serverwide_quota_success_description: `サーバー全体のクォータが期間あたり **{limit}** 枚の画像に設定されました。`,
          serverwide_quota_resets_in_days_description: `リセットまでの日数（1-365、デフォルト: 365）。`,
          serverwide_quota_resets_in_success_description: `サーバー全体のクォータは **{days}** 日ごとにリセットされます。`,
        },
        textgen: {
          description: `このサーバーのテキスト生成トリガークォータを設定します。`,
          unlimited: `無制限`,
          daily_user_quota_limit_description: `ユーザー1人あたりの日次テキスト数（0=無制限、1-100、デフォルト: 0）。`,
          daily_user_quota_success_title: `ユーザークォータが更新されました`,
          daily_user_quota_success_description: `ユーザークォータが1日あたり **{limit}** 回のテキストトリガーに設定されました。`,
          serverwide_quota_limit_description: `サーバー全体のテキスト数（0=無制限、1-99999、デフォルト: 0）。`,
          serverwide_quota_success_description: `サーバー全体のクォータが期間あたり **{limit}** 回のテキストトリガーに設定されました。`,
          serverwide_quota_resets_in_days_description: `リセットまでの日数（1-365、デフォルト: 365）。`,
          serverwide_quota_resets_in_success_description: `サーバー全体のテキストクォータは **{days}** 日ごとにリセットされます。`,
        },
        videogen: {
          description: `このサーバーの動画生成クォータを設定します。`,
          unlimited: `無制限`,
          daily_user_quota_limit_description: `ユーザー1人あたりの日次動画数（0=無制限、1-100、デフォルト: 3）。`,
          daily_user_quota_success_title: `ユーザークォータが更新されました`,
          daily_user_quota_success_description: `ユーザークォータが1日あたり **{limit}** 本の動画に設定されました。`,
          serverwide_quota_limit_description: `サーバー全体の動画数（0=無制限、1-99999、デフォルト: 0）。`,
          serverwide_quota_success_description: `サーバー全体のクォータが期間あたり **{limit}** 本の動画に設定されました。`,
          serverwide_quota_resets_in_days_description: `リセットまでの日数（1-365、デフォルト: 365）。`,
          serverwide_quota_resets_in_success_description: `サーバー全体の動画クォータは **{days}** 日ごとにリセットされます。`,
        },
        reset: {
          description: `画像/テキスト/動画生成のクォータプールをリセットします。`,
          scope_description: `ユーザーの日次クォータをリセットするか、サーバー全体クォータをリセットするかを選択します。`,
          scope_choice_user: `ユーザー`,
          scope_choice_server: `サーバー`,
          quota_type_description: `リセットするクォータの種類を選択します。`,
          quota_type_choice_imagegen: `画像生成`,
          quota_type_choice_textgen: `テキスト生成`,
          quota_type_choice_videogen: `動画生成`,
          user_select_title: `ユーザーを選択`,
          user_select_description: `日次クォータをリセットするユーザーを選択してください。`,
          user_select_placeholder: `ユーザーを選択...`,
          success_title: `クォータをリセットしました`,
          success_user_imagegen_description: `{user} の日次画像生成クォータ使用量をリセットしました。`,
          success_user_textgen_description: `{user} の日次テキスト生成トリガークォータ使用量をリセットしました。`,
          success_user_videogen_description: `{user} の日次動画生成クォータ使用量をリセットしました。`,
          success_server_imagegen_description: `サーバー全体の画像生成クォータプールをリセットしました。`,
          success_server_textgen_description: `サーバー全体のテキスト生成トリガークォータプールをリセットしました。`,
          success_server_videogen_description: `サーバー全体の動画生成クォータプールをリセットしました。`,
        },
      },
      "member-permissions": {
        description: `管理者以外のメンバーが私に何を教えられるかを設定します。`,
        servermemories_option: `サーバーの記憶`,
        attributelist_option: `属性リスト`,
        sampledialogues_option: `サンプル対話`,
        servermemories_desc: `サーバー記憶の追加・削除`,
        attributelist_desc: `性格属性の追加・削除`,
        sampledialogues_desc: `サンプル対話の追加・削除`,
        select_placeholder: `メンバーに許可することを選択...`,
        select_embed_title: `メンバー教育権限`,
        select_embed_description: `管理者以外のメンバーが**教えられる**ことを選択してください。チェックあり = 許可。`,
        no_changes_title: `変更なし`,
        no_changes_description: `すべての権限はすでに選択した値に設定されています。`,
        success_title: `メンバー権限が更新されました`,
        success_description: `**{count}** 件の権限を更新しました。`,
      },
      avatar: {
        description: `このサーバーで選択したペルソナのアバターを設定または削除します。`,
        image_description: `アバターとして設定する画像。空白のまま送信すると、代わりに選択したペルソナのアバターをクリアします。`,
        image_label: `アバター画像`,
        persona_modal_title: `ペルソナを選択`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `アバターを更新するペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        success_title: `アバターが更新されました`,
        success_description: `このサーバー用のアバターの更新に成功しました。`,
        success_alter_description: `ペルソナ「{persona_name}」のアバターを更新しました。`,
        removed_title: `アバターがリセットされました`,
        removed_description: `このサーバー用のアバターをデフォルトにリセットしました。`,
        removed_alter_description: `ペルソナ「{persona_name}」のアバターをリセットしました。`,
        invalid_image_title: `無効な画像`,
        invalid_image_description: `有効な画像ファイルを提供してください。`,
        file_too_large_description: `画像ファイルが大きすぎます。最大ファイルサイズは8MBです。`,
        invalid_format_description: `PNG、JPG、JPEG、またはGIF画像ファイルを提供してください。`,
        conversion_error_title: `変換エラー`,
        conversion_error_description: `画像の処理に失敗しました。別の画像ファイルを試してください。`,
        api_error_title: `APIエラー`,
        api_error_description: `Discord APIを通じてアバターの更新に失敗しました。アバターを短時間で変更しすぎたことによるレート制限が原因であることが多いです。しばらく待ってから再度お試しください。`,
        error_download_timeout: `アバターのダウンロードが15秒後にタイムアウトしました。もう一度お試しください。`,
        error_api_timeout: `Discord API呼び出しが15秒後にタイムアウトしました。もう一度お試しください。`,
      },
      initialize: {
        description: `AI分析を使用してサーバー機能を初期化します`,
        expressions: {
          description: `AIビジョンを使用してすべてのカスタム絵文字とスタンプを分析・分類します`,
          success_title: `絵文字とスタンプを初期化しました`,
          success_description: `{emoji_count}個の絵文字と{sticker_count}個のスタンプ（合計{total}個）を分析・分類しました。`,
          model_incompatible_title: `互換性のないモデル`,
          model_incompatible_description: `現在のモデル（{model_name}）は{missing_capability}をサポートしていません。\`/config model text\`を使用して、画像ビジョンと構造化出力の両方をサポートするモデルに切り替えてください。`,
          already_initialized_title: `初期化するものがありません`,
          already_initialized_description: `すべての絵文字とスタンプはすでに分析・分類されています。`,
          partial_success_title: `部分的に成功`,
          partial_success_description: `{total}個の絵文字/スタンプのうち{successful}個を分析しました。{failed}個は処理されませんでした。残りの絵文字/スタンプを処理するには、このコマンドを再度実行してください。`,
          no_matches_title: `一致するものが見つかりません`,
          no_matches_description: `AIは絵文字/スタンプを分析しましたが、データベースと一致する結果が見つかりませんでした。処理エラーの可能性があります。`,
          llm_error_title: `AI分析に失敗しました`,
          llm_error_description: `AIモデルが絵文字/スタンプの分析中にエラーに遭遇しました。後でもう一度お試しください。`,
          validation_error_title: `無効なAI応答`,
          validation_error_description: `AIが無効な応答形式を返しました。これはモデルの問題である可能性があります。`,
          progress_analyzing: `{total}枚の画像を分析中...`,
          progress_analyzing_batch: `{total_uninitialized}枚のうち{batch_size}枚の画像を分析中（バッチ処理中 - 残りの絵文字/スタンプを処理するには、このコマンドを再度実行してください）`,
        },
      },
      matrix: {
        link: {
          description: `DiscordチャンネルをMatrixルームに双方向リレーでリンクします`,
          channel_description: `リンクするDiscordチャンネル`,
          room_description: `リンクするMatrixルームID（例：!abc:matrix.org）`,
          success_title: `Matrixルームをリンクしました`,
          success_description: `<#{channel_id}>が\`{room_id}\`とブリッジされました。TomoriのメッセージがMatrixルームに表示され、Matrixのメッセージもここに表示されます。

セットアップ手順、Matrix側で使えるコマンド、現在の制限一覧は {help_matrix} を確認してください。`,
          invalid_room_title: `無効なルームID`,
          invalid_room_description: `MatrixルームIDは\`!\`で始まり\`:\`を含む必要があります（例：\`!abc:matrix.org\`）。ルームIDを確認して再試行してください。`,
          join_failed_description: `<#{channel_id}>が\`{room_id}\`にリンクされましたが、Matrixルームに自動的に参加できませんでした。\`{bot_user_id}\`をルームに手動で招待し、必要なら {help_matrix} でセットアップ手順と制限一覧を確認してください。`,
          encrypted_room_title: `暗号化されたルームはリンクできません`,
          encrypted_room_description: `\`{room_id}\`はエンドツーエンド暗号化が有効です。Matrixの暗号化は一度設定すると無効にできないため、このルームはブリッジに使用できません。暗号化なしの新しいMatrixルームを作成し、代わりに\`{bot_user_id}\`を招待してください。`,
          matrix_not_configured_title: `Matrixブリッジ利用不可`,
          matrix_not_configured_description: `このBotインスタンスではMatrixブリッジが設定されていません。有効にするにはBot管理者にお問い合わせください。`,
        },
        unlink: {
          description: `DiscordチャンネルからMatrixブリッジリンクを削除します`,
          channel_description: `Matrixルームからリンクを解除するDiscordチャンネル`,
          success_title: `Matrixルームのリンクを解除しました`,
          success_description: `<#{channel_id}>はどのMatrixルームともブリッジされていません。`,
          not_linked_title: `リンクされていません`,
          not_linked_description: `<#{channel_id}>にはMatrixルームがリンクされていません。`,
        },
      },
      alwaysreply: {
        description: `メインペルソナの常時応答モードを切り替えます。`,
        enabled_title: `常時応答が有効になりました`,
        enabled_description: `**{persona_name}** はトリガーワードなしでもこのサーバーのすべてのメッセージに返信します。オルタペルソナは引き続きトリガーワードが必要です — オルタがトリガーされた場合、**{persona_name}** は二重応答を避けるために応答しません。`,
        disabled_title: `常時応答が無効になりました`,
        disabled_description: `**{persona_name}** はトリガーワード、メンション、またはリプライでのみ応答します。`,
      },
      deliberatetriggermode: {
        description: `このサーバーの明示的トリガーモード（DTM）を切り替えます。`,
        enabled_title: `明示的トリガーモードが有効になりました`,
        enabled_description: `**{persona_name}** は直接的な呼びかけにのみ応答します：\`@{trigger}\`プレフィックス、リプライ、Discordメンション、または\`/bot respond\`。通常のトリガーワードだけでは起動しません。`,
        disabled_title: `明示的トリガーモードが無効になりました`,
        disabled_description: `**{persona_name}** は再びトリガーワードで応答します。`,
      },
    },
    personal: {
      description: `あなたの個人的な設定を管理します`,
      config: {
        description: `個人設定データを管理します。`,
        export: {
          description: `個人設定をJSONでエクスポートします。`,
        },
        import: {
          description: `個人設定をJSONからインポートします。`,
          file_description: `個人設定のJSONファイル。`,
          confirmation_description: `警告：インポートするファイルの内容に応じて、既存の個人設定が置き換えられる場合があります。続行しますか？`,
          confirmation_choice_yes: `はい、インポートする`,
          confirmation_choice_no: `いいえ、キャンセル`,
        },
        remove: {
          description: `個人設定をリセットします。`,
          confirmation_description: `個人設定をリセットしてよいか確認します。`,
          confirmation_choice_yes: `はい、リセットする`,
          confirmation_choice_no: `いいえ、キャンセル`,
        },
      },
      privacy: {
        description: `個人記憶の保存とプライバシー設定を管理します`,
        modal_title: `プライバシー設定`,
        select_label: `プライバシーレベル`,
        select_description: `プライバシー保護のレベルを選択してください`,
        choice_minimal: `なし`,
        desc_minimal: `完全なパーソナライズ：記憶、ステータス、カスタムニックネーム、ボットのトリガーが可能。`,
        choice_partial: `部分的`,
        desc_partial: `メッセージは表示されますが、個人記憶/ステータスはAIに表示されません。`,
        choice_full: `完全`,
        desc_full: `最大限のプライバシー：完全に非表示、メッセージ、記憶、ボットのトリガーはありません。`,
        success_title: `プライバシー設定が更新されました`,
        success_description: `プライバシーレベルが\`{previous_value}\`から\`{value}\`に変更されました。

\`/personal privacy\`を使用していつでも変更できます。`,
        already_set_title: `変更はありません`,
        already_set_description: `プライバシーレベルは既に\`{value}\`に設定されています。`,
        invalid_value_description: `無効なプライバシーレベルが選択されました。もう一度お試しください。`,
      },
      language: {
        description: `インターフェースの優先言語を設定します。`,
        value_description: `インターフェースの優先言語を選択してください。`,
        choice_english: `英語`,
        choice_japanese: `日本語`,
        invalid_value_title: `無効な言語`,
        invalid_value_description: `言語は次のいずれかでなければなりません: {supported}。`,
        already_set_title: `言語は既に設定済みです`,
        already_set_description: `あなたの言語設定は既に \`{value}\` に設定されています。`,
        success_title: `言語が更新されました`,
        success_description: `あなたのインターフェース言語が \`{previous_value}\` から \`{value}\` に変更されました。`,
      },
      nickname: {
        description: `私があなたを呼ぶ名前を変更します。`,
        option_description: `私があなたに使用すべきニックネーム（2〜32文字）。`,
        invalid_length_title: `無効なニックネームの長さ`,
        invalid_length: `ニックネームは {min}〜{max} 文字でなければなりません。`,
        success_title: `個人的なニックネームが更新されました`,
        success_description: `わかりました、これからはあなたのことを '{new_nickname}' と呼びます（以前は '{old_nickname}' でした）。`,
        success_but_disabled_description: `わかりました、あなたのことを '{new_nickname}' と呼ぶことを覚えておきます（以前は '{old_nickname}' でした）。

**警告:** 現在、このサーバーではパーソナライズが無効になっているため、このニックネームはここでは使用しません。パーソナライズが有効になっている他のサーバーでは使用します。`,
      },
      impersonate: {
        description: `ユーザーなりすまし設定を管理します。`,
        prompt: {
          description: `あなたをどうなりすますかを伝える再利用プロンプトを設定します。`,
          modal_title: `ユーザーなりすましプロンプト`,
          prompt_label: `ペルソナプロンプト`,
          prompt_description: `あなたのなりすましが呼び出されたときに使われます。空欄で送信するとクリアされます。`,
          prompt_placeholder: `砕けた口調で、短めに、全部小文字多め、友達には少しだけ煽り気味で...`,
          success_title: `なりすましプロンプトを更新しました`,
          success_description: `今後はどこでも、ユーザーなりすまし返信でこのプロンプトが使われます。`,
          cleared_title: `なりすましプロンプトをクリアしました`,
          cleared_description: `ユーザーなりすましプロンプトを削除しました。`,
          already_set_title: `変更はありません`,
          already_set_description: `ユーザーなりすましプロンプトは既にその内容に設定されています。`,
          already_cleared_title: `プロンプト未設定`,
          already_cleared_description: `現在、ユーザーなりすましプロンプトは設定されていません。`,
        },
      },
      stm: {
        description: `STM（短期記憶）の設定を構成します`,
        option_description: `設定するSTM項目を選んでください`,
        crossserver_option: `サーバー間STM共有`,
        clear_option: `個人用STMをクリア`,
        crossserver: {
          title: `サーバー間STM共有`,
          enabled: `サーバー間STM共有が**有効**になりました。他のサーバーでのあなたの会話を参照できるようになります。`,
          disabled: `サーバー間STM共有が**無効**になりました。このサーバーでのあなたの会話のみを参照します。`,
        },
        clear: {
          title: `STMがクリアされました`,
          success: `ユーザー固有のSTMがすべてのチャンネルでクリアされました。`,
        },
      },
    },
    "scheduled-task": {
      description: `スケジュール済みタスクとリマインダーを管理します。`,
      remove: {
        description: `スケジュール済みタスクまたはリマインダーを削除します。`,
        modal_title: `スケジュール済みタスクの削除`,
        select_label: `削除するスケジュール済みタスク`,
        select_description: `削除するスケジュール済みタスクまたはリマインダーを選択してください`,
        select_placeholder: `スケジュール済みタスクを選択...`,
        no_entries_title: `スケジュール済みタスクがありません`,
        no_entries: `削除するスケジュール済みタスクやリマインダーがありません。リマインドしてほしい内容を私に伝えるか、タスクを予定してください。`,
        success_title: `スケジュール済みタスクが削除されました`,
        success_description: `正常に削除しました: "{reminder_purpose}"`,
      },
    },
    memory: {
      description: `保存された記憶とドキュメントを管理します。`,
      document: {
        description: `ドキュメント記憶を管理します。`,
        add: {
          description: `ドキュメントを記憶に追加します。`,
          name_description: `選択したスコープ内で一意のドキュメント名。`,
          file_description: `アップロードするドキュメントファイル（.txt、.md、.pdf）。`,
          scope_description: `ドキュメントをペルソナ専用にするか、サーバー全体で共有するかを選択します。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_serverwide: `サーバー全体`,
        },
        remove: {
          description: `ドキュメントを記憶から削除します。`,
          scope_description: `ペルソナスコープかサーバー全体スコープから削除するかを選択します。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_serverwide: `サーバー全体`,
        },
      },
      history: {
        description: `履歴から抽出したドキュメント記憶を管理します。`,
        import: {
          description: `AIを使ってこのチャンネルのメッセージ履歴から知識を抽出します。`,
          name_description: `生成するドキュメントの名前（選択したスコープ内でユニークである必要があります）。`,
          scope_description: `知識のスコープを選択: ペルソナ（デフォルト）、自動（ペルソナ検出）、またはグローバル。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_automatic: `自動`,
          scope_choice_global: `グローバル`,
          rag_disabled_title: `ドキュメントRAGが無効です`,
          rag_disabled_description: `非本番環境では文書の参照が無効です。.env に \`ACTIVATE_LOCAL_RAG=true\` を設定して有効化してください。`,
          no_permission_title: `権限がありません`,
          no_permission_description: `チャンネル履歴を抽出するには**サーバー管理**権限が必要です。`,
          model_incompatible_title: `モデルが非対応です`,
          model_incompatible_description: `現在のモデルは構造化出力をサポートしていないため、履歴抽出に使用できません。\`/config model text\`で対応モデルに切り替えてください。`,
          no_embedding_model_title: `埋め込みモデルが未設定です`,
          no_embedding_model_description: `埋め込みモデルが設定されていません。\`/config model embedding\`で設定してください。`,
          no_api_key_title: `APIキーが未設定です`,
          no_api_key_description: `履歴の抽出と埋め込みにはAPIキーが必要です。\`/config api-key set\`で設定してください。`,
          no_messages_title: `メッセージが見つかりません`,
          no_messages_description: `このチャンネルには知識を抽出できるメッセージがありません。`,
          no_facts_extracted_title: `ファクトが抽出されませんでした`,
          no_facts_extracted_description: `AIはチャンネル履歴から有意義なファクトを抽出できませんでした。会話が短すぎるか、些細なメッセージのみの場合に発生します。`,
          duplicate_title: `ドキュメント名が既に存在します`,
          duplicate_description: `\`{name}\`という名前のドキュメントがこのスコープに既に存在します。別の名前を選んでください。`,
          limit_exceeded_title: `ドキュメント上限に達しました`,
          limit_exceeded_description: `このスコープ（{scope}）には既に{current_count}件のドキュメントがあります（最大{max_allowed}件）。\`/memory document remove\`または\`/memory history remove\`で削除してから追加してください。`,
          server_chunk_limit_title: `サーバーのチャンク上限に達しました`,
          server_chunk_limit_description: `このスコープ（{scope}）のチャンク上限 {max_chunks} を超えるため追加できません。先に文書を削除してください。`,
          progress_fetching: `チャンネルメッセージを取得中...`,
          progress_extracting: `{message_count}件のメッセージから知識を抽出中（ウィンドウ {current}/{total}）...`,
          progress_embedding: `{fact_count}件のファクトの埋め込みを生成中...`,
          success_title: `履歴を抽出しました`,
          success_description: `**{message_count}**件のメッセージから**{fact_count}**件のファクトを抽出し、**{name}**として{scope}に保存しました（{chunk_count}チャンク）。`,
          success_automatic_description: `**{message_count}**件のメッセージから**{fact_count}**件のファクトを抽出しました。

{persona_list}`,
          success_automatic_persona_line: `**{persona_name}**: **{doc_name}**として保存（{chunk_count}チャンク）`,
          success_automatic_global_fallback: `ペルソナが検出されませんでした。**{name}**としてサーバー全体スコープに保存しました。`,
          scope_label_persona: `ペルソナ「{persona_name}」`,
          scope_label_global: `サーバー全体`,
        },
        remove: {
          description: `履歴から抽出したドキュメントを記憶から削除します。`,
          scope_description: `ペルソナスコープかサーバー全体スコープかを選択します。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_serverwide: `サーバー全体`,
          modal_title: `履歴ドキュメントの削除`,
          select_label: `削除するドキュメント`,
          select_description: `削除する履歴ドキュメントを選択してください`,
          select_placeholder: `ドキュメントを選択...`,
          rag_disabled_title: `ドキュメントRAGが無効です`,
          rag_disabled_description: `非本番環境では文書の参照が無効です。.env に \`ACTIVATE_LOCAL_RAG=true\` を設定して有効化してください。`,
          none_title: `履歴ドキュメントがありません`,
          none_description: `このスコープには削除できる履歴ドキュメントがありません。\`/memory history import\`で抽出してください。`,
          success_title: `履歴ドキュメントが削除されました`,
          success_description: `履歴ドキュメントを正常に削除しました: "{name}"`,
        },
      },
      personal: {
        description: `個人記憶を管理します。`,
        add: {
          description: `個人記憶を追加します。`,
          scope_description: `記憶をペルソナ記憶にするか、グローバル記憶にするかを選択します。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_global: `グローバル`,
        },
        edit: {
          description: `個人記憶を編集します。`,
          scope_description: `ペルソナ記憶かグローバル記憶かを選択します。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_global: `グローバル`,
          select_modal_title: `個人記憶を選択`,
          select_label: `編集する記憶`,
          select_description: `編集する個人記憶を選択してください`,
          select_placeholder: `記憶を選択...`,
          confirm_title: `個人記憶を編集しますか？`,
          confirm_description: `次の個人記憶を選択しました:
> {memory}

**確認** を押すと編集モーダルを開きます。`,
          modal_title: `個人記憶を編集`,
          memory_input_label: `更新後の個人記憶`,
          memory_input_description: `選択した個人記憶を新しいテキストに置き換えます。`,
          memory_input_placeholder: `{user}はマンゴーが好き`,
          no_changes_title: `変更はありません`,
          no_changes_description: `その個人記憶は既にその内容に設定されています。`,
          duplicate_title: `重複した個人記憶`,
          duplicate_description: `この記憶 '{memory}' は既にあなたの個人的な記憶にあります。`,
          success_title: `個人記憶を更新しました`,
          success_description: `個人記憶を正常に更新しました: "{memory}"`,
        },
        export: {
          description: `個人記憶をJSONでエクスポートします。`,
          scope_description: `ペルソナ記憶かグローバル記憶かを選択します。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_global: `グローバル`,
        },
        import: {
          description: `個人記憶をJSONからインポートします。`,
          file_description: `個人記憶のJSONファイル。`,
          target_description: `ペルソナ記憶に入れるか、グローバル記憶に入れるかを選択します。`,
          target_choice_global: `グローバル`,
          target_choice_persona: `ペルソナ`,
          confirmation_description: `警告：選択したスコープの既存の個人メモリが置き換えられる場合があります。続行しますか？`,
          confirmation_choice_yes: `はい、インポートする`,
          confirmation_choice_no: `いいえ、キャンセル`,
        },
        remove: {
          description: `個人記憶を削除します。`,
          scope_description: `ペルソナ記憶かグローバル記憶かを選択します。`,
          scope_choice_persona: `ペルソナ`,
          scope_choice_global: `グローバル`,
        },
      },
      server: {
        description: `サーバー記憶を管理します。`,
        add: {
          description: `サーバー記憶を追加します。`,
        },
        edit: {
          description: `サーバー記憶を編集します。`,
          select_modal_title: `サーバー記憶を選択`,
          select_label: `編集する記憶`,
          select_description: `編集するサーバー記憶を選択してください`,
          select_placeholder: `記憶を選択...`,
          confirm_title: `サーバー記憶を編集しますか？`,
          confirm_description: `次のサーバー記憶を選択しました:
> {memory}

**確認** を押すと編集モーダルを開きます。`,
          modal_title: `サーバー記憶を編集`,
          memory_input_label: `更新後のサーバー記憶`,
          memory_input_description: `選択したサーバー記憶を新しいテキストに置き換えます。`,
          memory_input_placeholder: `このサーバーのメンバーはマンゴーが好き`,
          no_changes_title: `変更はありません`,
          no_changes_description: `そのサーバー記憶は既にその内容に設定されています。`,
          duplicate_title: `重複した記憶`,
          duplicate_description: `この記憶 '{memory}' は既にこのサーバーの私の記憶にあります。`,
          success_title: `サーバー記憶を更新しました`,
          success_description: `サーバー記憶を正常に更新しました: "{memory}"`,
        },
        export: {
          description: `サーバー記憶をJSONでエクスポートします。`,
        },
        import: {
          description: `サーバー記憶をJSONからインポートします。`,
          file_description: `サーバー記憶のJSONファイル。`,
          confirmation_description: `警告：選択したペルソナスコープの既存のサーバーメモリが置き換えられる場合があります。続行しますか？`,
          confirmation_choice_yes: `はい、インポートする`,
          confirmation_choice_no: `いいえ、キャンセル`,
        },
        remove: {
          description: `サーバー記憶を削除します。`,
        },
      },
    },
    teach: {
      sampledialogue: {
        description: `私がどのように応答すべきかの例として、ユーザー/ボットの対話ペアを追加します。`,
        teaching_disabled_title: `サンプル対話の教育が無効です`,
        teaching_disabled_description: `現在、このサーバーではメンバーがサンプル対話を教える・取り除くことは許可されていません。\`サーバー管理\`権限を持つメンバーが\`/server member-permissions\`でこれを有効にできます。`,
        modal_title: `サンプル対話の追加`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `この対話を追加するペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        user_input_label: `ユーザーのセリフ`,
        user_input_description: `任意: 単発入力。.txt一括時は空欄にしてください。`,
        user_input_placeholder: `好きな食べ物は何ですか？`,
        bot_input_label: `私の応答`,
        bot_input_description: `任意: 単発入力。.txt一括時は空欄にしてください。`,
        bot_input_placeholder: `わ、わたしはマンゴーが好きです…`,
        batch_file_label: `一括 .txt ファイル`,
        batch_file_description: `任意: 2行で1組。1行目{user}:/{{user}}:, 2行目{bot}:/{{char}}:`,
        no_input_title: `入力がありません`,
        no_input_description: `手入力2欄を両方入力するか、.txtをアップロードしてください。`,
        manual_pair_required_description: `手入力は「ユーザーのセリフ」と「私の応答」の両方が必要です。`,
        invalid_file_title: `無効なファイル`,
        invalid_file_description: `.txtファイルをアップロードしてください。`,
        file_too_large_description: `.txtファイルが大きすぎます。最大 {max_size} MB です。`,
        download_failed_description: `アップロードされたファイルのダウンロードに失敗しました。もう一度お試しください。`,
        invalid_batch_format_title: `一括形式が無効です`,
        invalid_batch_format_description: `{line_number} 行目の形式が無効です。想定プレフィックス: {expected_prefix}`,
        duplicate_title: `新規の対話がありません`,
        duplicate_description: `入力された対話ペアはすべて既存です。`,
        limit_exceeded_title: `サンプル対話上限に達しました`,
        limit_exceeded_description: `このサーバーはサンプル対話の上限 {max_allowed} 個に達しました（現在 {current_count} 個）。新しいものを追加する前に、\`/persona sample-dialogue remove\`でいくつかのサンプル対話を削除してください。`,
        batch_limit_exceeded_title: `一括インポートが上限超過`,
        batch_limit_exceeded_description: `インポートに {import_count} 枠必要ですが、上限 {max_allowed} / 現在 {current_count} です。{remove_count} 件削除してから再試行してください。`,
        user_input_too_long_title: `ユーザー入力が長すぎます`,
        user_input_too_long_description: `ユーザー入力が長すぎます（{current_length} 文字）。最大許容長は {max_allowed} 文字です。`,
        bot_input_too_long_title: `ボットの応答が長すぎます`,
        bot_input_too_long_description: `ボットの応答が長すぎます（{current_length} 文字）。最大許容長は {max_allowed} 文字です。`,
        success_title: `サンプル対話が追加されました`,
        success_description: `新しいサンプル対話ペアを正常に追加しました:

**ユーザー:**
> {user_input}

**私:**
> {bot_input}`,
        batch_success_title: `サンプル対話を追加しました`,
        batch_success_description: `{added_count} 件のサンプル対話ペアを追加しました。`,
      },
      attribute: {
        description: `このサーバーでの私を表す人格属性を追加します。`,
        teaching_disabled_title: `属性の教育が無効です`,
        teaching_disabled_description: `現在、このサーバーではメンバーが人格属性を教える・取り除くことは許可されていません。\`サーバー管理\`権限を持つメンバーが\`/server member-permissions\`でこれを有効にできます。`,
        modal_title: `人格属性の追加`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `この属性を追加するペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        attribute_input_label: `新しい属性`,
        attribute_input_description: `任意: 単発入力。.txt一括時は空欄にしてください。`,
        attribute_input_placeholder: `{bot}はマンゴーが好き`,
        batch_file_label: `一括 .txt ファイル`,
        batch_file_description: `任意: 空でない各行を1属性として追加します。`,
        no_input_title: `入力がありません`,
        no_input_description: `属性を入力するか、.txtをアップロードしてください。`,
        invalid_file_title: `無効なファイル`,
        invalid_file_description: `.txtファイルをアップロードしてください。`,
        file_too_large_description: `.txtファイルが大きすぎます。最大 {max_size} MB です。`,
        download_failed_description: `アップロードされたファイルのダウンロードに失敗しました。もう一度お試しください。`,
        duplicate_title: `重複した属性`,
        duplicate_description: `この属性 '{attribute}' は既に私の属性リストにあります。`,
        limit_exceeded_title: `属性上限に達しました`,
        limit_exceeded_description: `このサーバーは属性の上限 {max_allowed} 個に達しました（現在 {current_count} 個）。新しいものを追加する前に、\`/persona attribute remove\`でいくつかの属性を削除してください。`,
        batch_limit_exceeded_title: `一括インポートが上限超過`,
        batch_limit_exceeded_description: `インポートに {import_count} 枠必要ですが、上限 {max_allowed} / 現在 {current_count} です。{remove_count} 件削除してから再試行してください。`,
        content_too_long_title: `属性の内容が長すぎます`,
        content_too_long_description: `属性の内容が長すぎます（{current_length} 文字）。最大許容長は {max_allowed} 文字です。`,
        success_title: `属性が追加されました`,
        success_description: `'{attribute}' を私の人格属性に正常に追加しました。`,
        batch_success_title: `属性を追加しました`,
        batch_success_description: `{added_count} 件の属性を追加しました。`,
      },
      document: {
        description: `Retrieval-Augmented Generationで参照できる文書を教えます。`,
        persona_modal_title: `ペルソナを選択`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `この文書を保存するペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        rag_disabled_title: `ドキュメントRAGが無効です`,
        rag_disabled_description: `非本番環境では文書の参照が無効です。.env に \`ACTIVATE_LOCAL_RAG=true\` を設定して有効化してください。`,
        teaching_disabled_title: `ドキュメントの教育が無効です`,
        teaching_disabled_description: `現在、このサーバーではメンバーが文書を教える・削除することは許可されていません。\`サーバー管理\`権限を持つメンバーが\`/server member-permissions\`で有効にできます。`,
        no_embedding_model_title: `埋め込みモデルが設定されていません`,
        no_embedding_model_description: `このプロバイダーには埋め込みモデルが設定されていません。\`/config model embedding\`で設定してください。`,
        no_api_key_title: `APIキーがありません`,
        no_api_key_description: `文書を埋め込むにはAPIキーが必要です。\`/config api-key set\`を使用してください。`,
        invalid_name_title: `無効な文書名`,
        invalid_name_description: `有効な文書名を入力してください（1〜64文字）。`,
        duplicate_title: `文書名が既に存在します`,
        duplicate_description: `「{name}」という名前の文書は既に存在します。別の名前を選んでください。`,
        limit_exceeded_title: `文書の上限に達しました`,
        limit_exceeded_description: `このスコープ（{scope}）は文書の上限 {max_allowed} 件に達しました（現在 {current_count} 件）。\`/memory document remove\`で削除してください。`,
        invalid_file_title: `無効なファイル`,
        file_too_large_title: `ファイルが大きすぎます`,
        file_too_large_description: `最大ファイルサイズは {max_size} MB です。`,
        download_failed_title: `ダウンロードに失敗しました`,
        download_failed_description: `アップロードされたファイルのダウンロードに失敗しました。もう一度試してください。`,
        empty_title: `文書が空です`,
        empty_description: `読み取れるテキストが見つかりませんでした。`,
        too_long_title: `文書が長すぎます`,
        too_long_description: `文書のテキストが長すぎます。最大 {max_length} 文字です。`,
        too_many_chunks_title: `チャンクが多すぎます`,
        too_many_chunks_description: `チャンク数が上限を超えました。1文書あたり最大 {max_chunks} チャンクです。`,
        server_chunk_limit_title: `サーバーのチャンク上限に達しました`,
        server_chunk_limit_description: `このスコープ（{scope}）のチャンク上限 {max_chunks} を超えるため追加できません。先に文書を削除してください。`,
        success_title: `文書を追加しました`,
        success_description: `**{name}** を {scope} に保存しました（{chunk_count} チャンク）。`,
        scope_label_persona: `ペルソナ「{persona_name}」`,
        scope_label_serverwide: `サーバー全体`,
      },
      personaprompt: {
        description: `system-prompt の後ろに追記するペルソナ専用プロンプトを設定します`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `ペルソナプロンプトを設定するには**サーバー管理**権限が必要です。`,
        persona_select_label: `ペルソナ`,
        persona_select_description: `更新するペルソナを選択してください。`,
        persona_select_placeholder: `ペルソナを選択...`,
        main_persona_description: `メインペルソナ`,
        alter_persona_description: `オルタペルソナ`,
        modal_title: `ペルソナプロンプトを設定`,
        part1_label: `ペルソナプロンプト（1/4）`,
        part1_description: `Discord の 4000 文字制限により、プロンプト入力は 4 つに分割されています。`,
        part1_placeholder: `例: ベテラン戦術家のように、簡潔で落ち着いた口調で話して。`,
        part2_label: `ペルソナプロンプト（2/4）- 任意`,
        part2_placeholder: `追加のペルソナ指示...`,
        part3_label: `ペルソナプロンプト（3/4）- 任意`,
        part3_placeholder: `さらにペルソナ指示...`,
        part4_label: `ペルソナプロンプト（4/4）- 任意`,
        part4_placeholder: `最後のペルソナ指示...`,
        success_title: `ペルソナプロンプトを更新しました`,
        success_description: `「{persona_name}」のペルソナプロンプトを更新しました。`,
      },
      memory: {
        description: `私の記憶を管理`,
        personal: {
          description: `どのサーバーでも私が覚えているあなたの個人的な記憶を追加します。`,
          modal_title: `個人的な記憶の追加`,
          persona_select_label: `ペルソナ`,
          persona_select_description: `この記憶を適用するペルソナを選択してください。`,
          persona_select_placeholder: `ペルソナを選択...`,
          main_persona_description: `メインペルソナ`,
          alter_persona_description: `オルタペルソナ`,
          memory_input_label: `新しい個人的な記憶`,
          memory_input_description: `任意: 単発入力。.txt一括時は空欄にしてください。`,
          memory_input_placeholder: `{user}はマンゴーが好き`,
          batch_file_label: `一括 .txt ファイル`,
          batch_file_description: `任意: 空でない各行を1記憶として追加します。`,
          no_input_title: `入力がありません`,
          no_input_description: `記憶を入力するか、.txtをアップロードしてください。`,
          invalid_file_title: `無効なファイル`,
          invalid_file_description: `.txtファイルをアップロードしてください。`,
          file_too_large_description: `.txtファイルが大きすぎます。最大 {max_size} MB です。`,
          download_failed_description: `アップロードされたファイルのダウンロードに失敗しました。もう一度お試しください。`,
          duplicate_title: `重複した個人的な記憶`,
          duplicate_description: `この記憶 '{memory}' は既にあなたの個人的な記憶にあります。`,
          limit_exceeded_title: `個人的な記憶の上限に達しました`,
          limit_exceeded_description: `あなたは個人的な記憶の上限 {max_allowed} 件に達しました（現在 {current_count} 件）。新しい記憶を追加する前に、\`/memory personal remove\`でいくつかの記憶を削除してください。`,
          batch_limit_exceeded_title: `一括インポートが上限超過`,
          batch_limit_exceeded_description: `インポートに {import_count} 枠必要ですが、上限 {max_allowed} / 現在 {current_count} です。{remove_count} 件削除してから再試行してください。`,
          content_too_long_title: `記憶の内容が長すぎます`,
          content_too_long_description: `記憶の内容が長すぎます。最大許容長は {max_length} 文字です。`,
          success_title: `個人的な記憶が追加されました`,
          success_description: `'{memory}' をあなたの個人的な記憶に正常に追加しました。`,
          batch_success_title: `個人的な記憶を追加しました`,
          batch_success_description: `{added_count} 件の個人的な記憶を追加しました。`,
          success_but_disabled_description: `'{memory}' をあなたの個人的な記憶に正常に追加しました。

**警告:** 現在、このサーバーではパーソナライズが無効になっているため、この記憶はここでは使用されません。パーソナライズが有効になっている他のサーバーでは引き続き利用可能です。`,
          batch_success_but_disabled_description: `{added_count} 件の個人的な記憶を追加しました。

**警告:** 現在、このサーバーではパーソナライズが無効になっているため、これらの記憶はここでは使用されません。パーソナライズが有効な他サーバーでは引き続き利用可能です。`,
          success_but_blacklisted_description: `'{memory}' をあなたの個人的な記憶に正常に追加しました。

**警告:** あなたは現在、このサーバーのパーソナライズ機能のブラックリストに登録されているため、この記憶はここでは使用されません。ブラックリストに登録されていない他のサーバーでは引き続き利用可能です。`,
          batch_success_but_blacklisted_description: `{added_count} 件の個人的な記憶を追加しました。

**警告:** あなたは現在、このサーバーのパーソナライズ機能のブラックリスト対象のため、これらの記憶はここでは使用されません。`,
          opted_out_error_title: `プライバシー保護が有効`,
          opted_out_error_description: `あなたはプライバシー上の理由から個人記憶の保存をオプトアウトしています。再び個人記憶を許可したい場合は、\`/personal privacy\`を使用してオプトインしてください。`,
        },
        server: {
          description: `私の知識ベースにサーバーの記憶を追加します。`,
          teaching_disabled_title: `サーバーの記憶の教育が無効です`,
          teaching_disabled_description: `現在、このサーバーではメンバーがサーバーの記憶を追加・取り除くすることは許可されていません。\`サーバー管理\`権限を持つメンバーが\`/server member-permissions\`でこれを有効にできます。`,
          modal_title: `サーバーの記憶の追加`,
          persona_select_label: `ペルソナ`,
          persona_select_description: `このサーバー記憶を適用するペルソナを選択してください。`,
          persona_select_placeholder: `ペルソナを選択...`,
          main_persona_description: `メインペルソナ`,
          alter_persona_description: `オルタペルソナ`,
          memory_input_label: `新しいサーバーの記憶`,
          memory_input_description: `任意: 単発入力。.txt一括時は空欄にしてください。`,
          memory_input_placeholder: `このサーバーのメンバーはマンゴーが好き`,
          batch_file_label: `一括 .txt ファイル`,
          batch_file_description: `任意: 空でない各行を1記憶として追加します。`,
          no_input_title: `入力がありません`,
          no_input_description: `記憶を入力するか、.txtをアップロードしてください。`,
          invalid_file_title: `無効なファイル`,
          invalid_file_description: `.txtファイルをアップロードしてください。`,
          file_too_large_description: `.txtファイルが大きすぎます。最大 {max_size} MB です。`,
          download_failed_description: `アップロードされたファイルのダウンロードに失敗しました。もう一度お試しください。`,
          duplicate_title: `重複した記憶`,
          duplicate_description: `この記憶 '{memory}' は既にこのサーバーの私の記憶にあります。`,
          limit_exceeded_title: `サーバーの記憶の上限に達しました`,
          limit_exceeded_description: `このサーバーは記憶の上限 {max_allowed} 件に達しました（現在 {current_count} 件）。新しい記憶を追加する前に、\`/memory server remove\`でいくつかの記憶を削除してください。`,
          batch_limit_exceeded_title: `一括インポートが上限超過`,
          batch_limit_exceeded_description: `インポートに {import_count} 枠必要ですが、上限 {max_allowed} / 現在 {current_count} です。{remove_count} 件削除してから再試行してください。`,
          content_too_long_title: `記憶の内容が長すぎます`,
          content_too_long_description: `記憶の内容が長すぎます。最大許容長は {max_length} 文字です。`,
          success_title: `サーバーの記憶が追加されました`,
          success_description: `'{memory}' を私のサーバーの記憶に正常に追加しました。`,
          batch_success_title: `サーバーの記憶を追加しました`,
          batch_success_description: `{added_count} 件のサーバー記憶を追加しました。`,
        },
      },
    },
    forget: {
      sampledialogue: {
        description: `私の記憶からサンプルユーザー/ボットの対話ペアを削除します。`,
        modal_title: `サンプル対話の削除`,
        select_label: `削除する対話`,
        select_description: `削除する対話ペアを選択してください`,
        select_placeholder: `対話を選択...`,
        no_dialogues_title: `サンプル対話がありません`,
        no_dialogues: `削除するサンプル対話が保存されていません。\`/persona sample-dialogue add\`で追加してください。`,
        success_title: `サンプル対話が削除されました`,
        success_description: `対話ペアを正常に削除しました: ユーザー: "{input}" → ボット: "{output}"`,
      },
      attribute: {
        description: `私の記憶から人格属性を削除します。`,
        modal_title: `属性の削除`,
        select_label: `削除する属性`,
        select_description: `私の人格から削除する属性を選択してください`,
        select_placeholder: `属性を選択...`,
        no_attributes_title: `属性がありません`,
        no_attributes: `削除する人格属性がありません。\`/persona attribute add\`で追加してください。`,
        success_title: `属性が削除されました`,
        success_description: `属性を正常に削除しました: "{attribute}"`,
      },
      document: {
        description: `サーバーの文書を削除します。`,
        modal_title: `文書の削除`,
        select_label: `削除する文書`,
        select_description: `削除する文書を選択してください`,
        select_placeholder: `文書を選択...`,
        rag_disabled_title: `ドキュメントRAGが無効です`,
        rag_disabled_description: `非本番環境では文書の参照が無効です。.env に \`ACTIVATE_LOCAL_RAG=true\` を設定して有効化してください。`,
        none_title: `文書がありません`,
        none_description: `このスコープには削除できる文書がありません。\`/memory document add\`で追加してください。`,
        success_title: `文書が削除されました`,
        success_description: `文書を正常に削除しました: "{name}"`,
      },
      personaprompt: {
        description: `ペルソナ専用プロンプトをクリアします`,
        no_permission_title: `🔴 権限がありません`,
        no_permission_description: `ペルソナプロンプトをクリアするには**サーバー管理**権限が必要です。`,
        success_title: `ペルソナプロンプトをクリアしました`,
        success_description: `「{persona_name}」のペルソナプロンプトをクリアしました。`,
      },
      memory: {
        personal: {
          description: `個人的な記憶を削除します。`,
          modal_title: `個人的な記憶の削除`,
          select_label: `削除する記憶`,
          select_description: `削除する個人的な記憶を選択してください`,
          select_placeholder: `記憶を選択...`,
          no_memories_title: `個人的な記憶がありません`,
          no_memories: `あなたには個人的な記憶が保存されていません。\`/memory personal add\`で追加してください。`,
          success_title: `個人的な記憶が削除されました`,
          success_description: `個人的な記憶を正常に削除しました: "{memory}"`,
          warning_disabled_title: `パーソナライズが無効です`,
          warning_disabled_description: `記憶は正常に削除されました。

**警告:** 現在、このサーバーではパーソナライズが無効になっているため、この変更はここでの私の行動に影響しません。パーソナライズが有効になっている他のサーバーでは反映されます。`,
        },
        server: {
          description: `私の知識からサーバーの記憶を削除します。`,
          modal_title: `サーバーの記憶の削除`,
          select_label: `削除する記憶`,
          select_description: `削除するサーバーの記憶を選択してください`,
          select_placeholder: `記憶を選択...`,
          no_memories_title: `サーバーの記憶がありません`,
          no_memories: `このサーバーにはサーバーの記憶が保存されていません。\`/memory server add\`で追加してください。`,
          no_owned_memories: `あなたが所有していて削除できるサーバーの記憶はありません。`,
          memory_not_found: `選択された記憶が見つかりませんでした。`,
          success_title: `サーバーの記憶が削除されました`,
          success_description: `サーバーの記憶を正常に削除しました: "{memory}"`,
        },
      },
    },
    generate: {
      image: {
        description: `Google GeminiまたはOpenRouterを使用してAI画像を生成する`,
        modal: {
          title: `画像生成のリクエスト`,
          prompt_label: `画像プロンプト`,
          prompt_description: `生成したい画像を説明してください`,
          prompt_placeholder: `バナナを食べている、ショートヘアの可愛いエルフの美少女、マンガ風`,
          image_upload_label: `参照画像（オプション）`,
          image_upload_2_label: `参照画像2（オプション）`,
          image_upload_3_label: `参照画像3（オプション）`,
          image_upload_description: `画像間生成のために参照画像をアップロードできます`,
          aspect_ratio_label: `アスペクト比`,
          aspect_ratio_description: `希望するアスペクト比を選択してください`,
        },
        success_title: `🟢 画像生成が完了しました！`,
        field_prompt: `プロンプト`,
        field_model: `モデル`,
        field_generation_time: `生成時間`,
        field_aspect_ratio: `アスペクト比`,
        zai_no_img2img_warning: `Z.aiは画像から画像への生成に対応していません。参照画像は無視されましたが、テキストプロンプトから画像は生成されます。`,
        nvidia_no_img2img_warning: `NVIDIA NIMは画像から画像への生成に対応していません。参照画像は無視されましたが、テキストプロンプトから画像は生成されます。`,
        disabled_title: `🔴 画像生成が無効です`,
        disabled_description: `このサーバーでは画像生成が無効になっています。\`/config bot-permissions\` で有効にできます（管理権限が必要）。`,
        wrong_provider_title: `🔴 サポートされていないプロバイダー`,
        wrong_provider_description: `画像生成にはネイティブ画像生成に対応したプロバイダーが必要です。現在のプロバイダーは**{current_provider}**です。`,
        no_api_key_title: `🔴 APIキーがありません`,
        no_api_key_description: `APIキーが設定されていません。\`/config api-key set\`を使用してください。`,
        api_key_decrypt_failed_title: `🔴 APIキーエラー`,
        api_key_decrypt_failed_description: `APIキーの復号化に失敗しました。\`/config api-key set\`を使用して再設定してください。`,
        no_diffusion_model_title: `🔴 画像モデルがありません`,
        no_diffusion_model_description: `プロバイダーに対して画像拡散モデルが設定されていません。`,
        error_billing_title: `🔴 課金が必要です`,
        error_billing_description: `画像生成を使用するには、APIキーの課金を有効にする必要があります。`,
        error_safety_title: `🔴 コンテンツがブロックされました`,
        error_safety_description: `プロンプトが安全フィルターによってブロックされました。別のプロンプトを試してください。`,
        error_generation_failed_title: `🔴 生成に失敗しました`,
        error_generation_failed_description: `画像生成に失敗しました: {error}`,
        invalid_image_title: `🔴 無効な画像`,
        invalid_image_description: `有効な画像ファイル（PNG、JPGなど）をアップロードしてください。`,
        quota_exceeded_title: `🔴 画像クォータを超過しました`,
        quota_exceeded_description: `画像生成クォータに達しました。{reset_info}`,
        user_quota_exceeded_description: `日次画像生成クォータに達しました。{reset_info}`,
        serverwide_quota_exceeded_description: `このサーバーはこの期間の画像生成クォータに達しました。{reset_info}`,
        quota_resets_in_hours: `クォータは {hours} 時間後にリセットされます。`,
        quota_resets_in_days: `クォータは {days} 日後にリセットされます。`,
        quota_exceeded_footer: `このクォータは、このサーバーの管理者が \`/server quota\` で設定しています。`,
      },
      video: {
        description: `Google Veo、OpenRouter、またはZ.aiを使用してAI動画を生成します`,
        modal: {
          title: `動画を生成`,
          prompt_label: `動画プロンプト`,
          prompt_description: `生成したい動画の内容を説明してください`,
          prompt_placeholder: `山の湖に朝日が差し込み、水面に穏やかな波紋が広がる静かな風景`,
          image_upload_label: `参照画像（オプション）`,
          image_upload_description: `画像から動画を生成するための参照画像をアップロード`,
          aspect_ratio_label: `アスペクト比`,
          aspect_ratio_description: `希望のアスペクト比を選択してください`,
        },
        success_title: `🟢 動画が正常に生成されました！`,
        success_description: `\`{model}\` で {elapsed}秒で生成しました。
**プロンプト:** {prompt}`,
        generating_title: `🎬 動画を生成中...`,
        generating_description: `動画を生成しています。通常1〜3分かかります。しばらくお待ちください...`,
        disabled_title: `🔴 動画生成が無効です`,
        disabled_description: `このサーバーでは動画生成が無効になっています。\`Manage Server\`権限を持つメンバーが \`/config bot-permissions\` で有効にできます。`,
        wrong_provider_title: `🔴 サポートされていないプロバイダー`,
        wrong_provider_description: `動画生成にはGoogle、OpenRouter、またはZ.aiが必要です。現在のプロバイダーは **{current_provider}** です。`,
        no_api_key_title: `🔴 APIキーがありません`,
        no_api_key_description: `APIキーが設定されていません。\`/config api-key set\` を使用してください。`,
        api_key_decrypt_failed_title: `🔴 APIキーエラー`,
        api_key_decrypt_failed_description: `APIキーの復号に失敗しました。\`/config api-key set\` で再設定してください。`,
        no_video_model_title: `🔴 動画モデルがありません`,
        no_video_model_description: `プロバイダーに動画モデルが設定されていません。\`/config model video\` で設定してください。`,
        error_title: `🔴 動画生成に失敗しました`,
        unsupported_provider_description: `プロバイダー **{provider}** では動画生成がサポートされていません。`,
        no_data_description: `APIから動画データを受信できませんでした。生成がブロックされたか失敗した可能性があります。`,
        file_too_large_title: `🔴 動画が大きすぎます`,
        file_too_large_description: `生成された動画（{size_mb} MB）がDiscordの25 MBファイルサイズ制限を超えています。短いプロンプトや異なるアスペクト比をお試しください。`,
        invalid_image_title: `🔴 無効な画像`,
        invalid_image_description: `アップロードされた参照画像を処理できませんでした。別の画像をお試しください。`,
        timeout_description: `動画生成がタイムアウトしました。プロバイダーに負荷がかかっている可能性があります。後でもう一度お試しください。`,
        blocked_description: `プロバイダーのコンテンツ安全フィルターにより動画生成がブロックされました。別のプロンプトをお試しください。`,
        generic_error_description: `動画生成中に予期しないエラーが発生しました。後でもう一度お試しください。`,
        quota_exceeded_title: `🔴 動画クォータ超過`,
        quota_exceeded_description: `動画生成クォータに達しました。{reset_info}`,
        user_quota_exceeded_description: `日次動画生成クォータに達しました。{reset_info}`,
        serverwide_quota_exceeded_description: `このサーバーはこの期間の動画生成クォータに達しました。{reset_info}`,
        quota_resets_in_hours: `クォータは {hours} 時間後にリセットされます。`,
        quota_resets_in_days: `クォータは {days} 日後にリセットされます。`,
        quota_exceeded_footer: `このクォータは、このサーバーの管理者が \`/server quota\` で設定しています。`,
      },
    },
  },
  events: {
    addBot: {
      rejoin_title: `TomoriBotが戻ってきました！`,
      rejoin_description: `このサーバーに再追加されたようです。以前の設定と人格はそのままです！\`/config\`、\`/persona\`、\`/memory\`、\`/server\`コマンドで私を管理できます。\`/memory personal export\`、\`/memory server export\`、\`/personal config\`、\`/server config\`でいつでもデータのエクスポートやリセットができます。

			プロバイダーを変更したい場合は、\`/config api-key set\`コマンドを使用してください。

			**TomoriBotを使用することで、[利用規約](https://github.com/Bredrumb/TomoriBot/blob/main/legal/ja/terms-of-service.md)と[プライバシーポリシー](https://github.com/Bredrumb/TomoriBot/blob/main/legal/ja/privacy-policy.md)に同意したことになります。**\`/legal terms\`と\`/legal privacy\`でいつでも確認できます。`,
      setup_prompt_title: `TomoriBotの追加が完了しました`,
      setup_prompt_description: `追加してくれてありがとうございます！始めるには、**サーバー管理**権限を持つ方が\`/config setup\`コマンドを実行して、私の初期の人格を選択し、AI機能を設定する必要があります。\`/memory personal export\`、\`/memory server export\`、\`/personal config\`、\`/server config\`でいつでもデータのエクスポートやリセットができます。

			選択したAIプロバイダーのAPIキーの作成方法が不明な場合は、\`/help api-key\`コマンドを使用してください。APIキーは暗号化されて保存されますが、公開されているDiscordボットに提供することに不安がある場合（通常そうあるべきです）、[リポジトリのガイド](https://github.com/Bredrumb/TomoriBot)を使用してご自身でTomoriBotを実行することもできます。

			**TomoriBotを使用することで、[利用規約](https://github.com/Bredrumb/TomoriBot/blob/main/legal/ja/terms-of-service.md)と[プライバシーポリシー](https://github.com/Bredrumb/TomoriBot/blob/main/legal/ja/privacy-policy.md)に同意したことになります。**\`/legal terms\`と\`/legal privacy\`でいつでも確認できます。`,
    },
  },
  reminders: {
    reminder_set_title: `⏰ {persona_nickname}がリマインダーを設定しました`,
    reminder_set_description: `{user_nickname}さんに「**{reminder_purpose}**」について\`{reminder_time}\`にリマインドします`,
    reminder_set_footer: `{time_remaining}後にメンションを送信します。リマインダーは\`/scheduled-task remove\`で削除できます。`,
    reminder_set_footer_recurring: `最初のメンションは{time_remaining}後です。{repetition_interval_hours}時間ごとに繰り返します。リマインダーは\`/scheduled-task remove\`で削除できます。`,
    recurring_task_set_title: `🔁 {persona_nickname}が定期タスクを設定しました`,
    recurring_task_set_description: `「**{reminder_purpose}**」を\`{reminder_time}\`から実行し、{repetition_interval_hours}時間ごとに繰り返します。`,
    recurring_task_set_footer: `リマインダーは\`/scheduled-task remove\`で削除できます。`,
    task_set_title: `✅ {persona_nickname}がタスクを設定しました`,
    task_set_description: `「**{reminder_purpose}**」を\`{reminder_time}\`に実行します`,
    task_set_footer: `{time_remaining}後にタスクを実行します。リマインダーは\`/scheduled-task remove\`で削除できます。`,
    reminder_triggered_title: `🔵 リマインダー通知`,
    task_triggered_title: `🔵 タスク通知`,
    triggered_description: `{reminder_purpose}`,
    triggered_footer: `生成中にエラーが発生したため、代わりに生のリマインダーを送信しました`,
  },
  tools: {
    generate_image: {
      quota_exceeded_generic: `画像生成クォータを超過しました。`,
      user_quota_exceeded: `日次画像生成クォータに達しました。{reset_info}`,
      serverwide_quota_exceeded: `このサーバーはこの期間の画像生成クォータに達しました。{reset_info}`,
      quota_resets_in_hours: `クォータは {hours} 時間後にリセットされます。`,
      quota_resets_in_days: `クォータは {days} 日後にリセットされます。`,
      quota_remaining: `本日はあと {remaining} 枚の画像を生成できます。`,
    },
    generate_video: {
      disabled: `このサーバーでは動画生成が無効になっています。`,
      quota_exceeded_generic: `動画生成クォータを超過しました。`,
      user_quota_exceeded: `日次動画生成クォータに達しました。{reset_info}`,
      serverwide_quota_exceeded: `このサーバーはこの期間の動画生成クォータに達しました。{reset_info}`,
      quota_resets_in_hours: `クォータは {hours} 時間後にリセットされます。`,
      quota_resets_in_days: `クォータは {days} 日後にリセットされます。`,
      quota_remaining: `本日はあと {remaining} 本の動画を生成できます。`,
      file_too_large: `生成された動画（{size_mb} MB）がDiscordの25 MBファイルサイズ制限を超えています。`,
    },
    generate_image_nai: {
      no_google_api_key: `インペインティングには画像セグメンテーション用のGoogle APIキーが必要です。/optional-key google setで設定するか、Googleプロバイダーに切り替えてください。`,
      provider_quota_exceeded: `このアカウントではNovelAI画像生成クォータを使い切っています。Anlasを補充するか、クォータのリフレッシュ後に再試行してください。`,
      characters_require_v4: `キャラクター配置にはNovelAI V4以降の拡散モデルが必要です。`,
      character_requires_id_or_tags: `キャラクター項目 #{index} には id か tags のどちらかが必要です。`,
      invalid_character_identity: `無効なキャラクターIDです: {id}。persona:<id>、短い数値のペルソナID、またはDiscordのユーザースノーフレークを使用してください。`,
    },
  },
  matrix: {
    notices: {
      invited: `TomoriBotがこのルームに参加しました。

セットアップを完了するには:
1. Discordで、ブリッジしたいチャンネルで {link_command} を実行します。
2. {room_id_path} にあるこのルームの Internal Room ID を貼り付けます。

重要:
- このルームは非暗号化のままにしてください。
- リンク後は、このルームで普通に話しかければ使えます。
- Matrix側で使えるテキストコマンドは {kill_command} と {refresh_command} のみです。

詳しい手順と制限一覧は、Discordで {help_command} を確認してください。`,
      linked: `このルームはDiscordチャンネル {channel_name} とブリッジされました。

クイックヒント:
- ここで普通に話しかければTomoriBotと会話できます。
- Matrix側で使えるテキストコマンドは {kill_command} と {refresh_command} のみです。
- Slash Command、DM、ピン留めはMatrixから使えません。
- カスタム絵文字/Markdownは安定して描画されず、Embedはプレーンテキストとして転送されます。
- Matrixユーザーの個人メモリはサーバーメモリにフォールバックします。

詳しい手順と現在の制限は、Discordで {help_command} を確認してください。`,
    },
  },
};
