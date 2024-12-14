const bookingApprovedMessage = {
    notification: {
        title: "Booking Approved!",
        body: "Congratulations🎉👏, your booking has been approved. Kindly proceed to the Sheesh Mahal🛕 to capture your breathtaking drone shot.",
        image: "https://cdn.britannica.com/50/152850-050-2DB7645E/Wall-centre-background-Amer-Palace-Sun-Gate.jpg",
    },
    data: {
        type: "booking"
    }
};

const bookingCreatedMessage = {
    notification: {
        title: "Booking Created!",
        body: "Great news🎊! Your booking has been successfully created. Get ready for an exceptional adventure with Droame.  🎉✨",
        image: "https://images.unsplash.com/photo-1473186639016-1451879a06f0?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDh8fGRyb25lfGVufDB8fDB8fHww"
    },
    data: {
        type: "booking"
    }
};

const videoUpladedMessage = {
    notification: {
        title: "Video Uploaded!",
        body: "Knock knock... Your aerial masterpiece is ready🚀! Dive into the stunning views now. 🎥",
        image: "https://images.unsplash.com/photo-1473186639016-1451879a06f0?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDh8fGRyb25lfGVufDB8fDB8fHww"
    },
    data: {
        type: "booking"
    }
};

const videoSharedMessage = {
    notification: {
        title: "Video Shared!",
        body: "🌟 Your cherished memories are now in the app! Relive the magic whenever you want. Happy Droaming! 📸✨",
        image: "https://images.unsplash.com/photo-1473186639016-1451879a06f0?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDh8fGRyb25lfGVufDB8fDB8fHww"
    },
    data: {
        type: "booking"
    }
};

module.exports.bookingCreatedMessage = bookingCreatedMessage;
module.exports.bookingApprovedMessage = bookingApprovedMessage;
module.exports.videoUpladedMessage = videoUpladedMessage;
module.exports.videoSharedMessage = videoSharedMessage;