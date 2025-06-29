const { join } = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const fs = require('fs');

// Database file path
const dbPath = join(__dirname, '..', 'data', 'db.json');
const dataDir = join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const adapter = new FileSync(dbPath);
const db = low(adapter);

db.defaults({ profiles: [] }).write();

/**
 * Get user profile by sub
 * ユーザーIDでプロフィールを取得
 */
const getUserProfile = async (sub) => {
  return db.get('profiles').find({ sub }).value() || null;
};

/**
 * Create user profile
 * 新しいユーザープロフィールを作成
 */
const createUserProfile = async (profileData) => {
  // 既存チェック
  const existing = db.get('profiles').find({ sub: profileData.sub }).value();
  if (existing) return existing;
  const newProfile = {
    sub: profileData.sub,
    nickname: profileData.nickname || 'user',
    email: profileData.email,
    createdAt: profileData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.get('profiles').push(newProfile).write();
  return newProfile;
};

/**
 * Update user profile
 * ユーザープロフィールを更新
 */
const updateUserProfile = async (sub, updateData) => {
  const updated = db.get('profiles')
    .find({ sub })
    .assign({ ...updateData, updatedAt: new Date().toISOString() })
    .write();
  return updated;
};

/**
 * Delete user profile
 * ユーザープロフィールを削除
 */
const deleteUserProfile = async (sub) => {
  db.get('profiles').remove({ sub }).write();
  return true;
};

/**
 * Get all profiles (admin function)
 * 全プロフィールを取得（管理者用）
 */
const getAllProfiles = async () => {
  return db.get('profiles').value();
};

/**
 * Get database statistics
 * データベース統計を取得
 */
const getDatabaseStats = async () => {
  return {
    totalProfiles: db.get('profiles').size().value(),
    lastUpdated: new Date().toISOString(),
    databasePath: dbPath
  };
};

module.exports = {
  getUserProfile,
  createUserProfile,
  updateUserProfile,
  deleteUserProfile,
  getAllProfiles,
  getDatabaseStats
}; 