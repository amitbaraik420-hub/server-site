const getUserProfile = async (req, res, usersCollection) => {
  try {
    // 🟢 authMiddleware থেকে আসা decoded ইমেইলটি নেওয়া হলো
    const userEmail = req.decoded?.email; 

    if (!userEmail) {
      return res.status(400).json({ message: 'Invalid token payload!' });
    }

    // 🟢 মঙ্গোডিবি কালেকশন থেকে ইউজার খোঁজা
    const user = await usersCollection.findOne({ email: userEmail });

    if (!user) {
      return res.status(404).json({ message: 'User not found!' });
    }

    // 🔒 রেসপন্স পাঠানোর আগে পাসওয়ার্ড সিকিউরলি আলাদা (হাইড) করে ফেলা
    const { password, ...userData } = user;
    
    res.status(200).json(userData);
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  getUserProfile
};