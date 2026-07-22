-- パスワードを平文管理に変更(ローカル運用の割り切り)
ALTER TABLE `users` CHANGE `password_hash` `password` VARCHAR(255) NOT NULL;

-- 既存ユーザーはハッシュ値のままなので初期パスワードに置き換える
UPDATE `users` SET `password` = 'Coolied2026!';
