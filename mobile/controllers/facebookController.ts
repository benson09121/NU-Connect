// @ts-nocheck
const axios = require('axios');
require('dotenv').config();

// Get posts from your own page (requires page access token)
async function getFacebookPosts(req, res) {
    try {
        // For Facebook Pages (Free) - Use page access token
        const response = await axios.get(`https://graph.facebook.com/v18.0/${process.env.FB_PAGE_ID}/posts`, {
            params: {
                fields: 'message,created_time,full_picture,permalink_url,story,attachments{media,url,title,description}',
                access_token: process.env.FB_PAGE_ACCESS_TOKEN,
                limit: 25 // Free tier allows reasonable limits
            }
        });
        
        res.json({
            success: true,
            data: response.data.data,
            paging: response.data.paging
        });
    } catch (error) {
        console.error('Facebook API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

// Get posts from OTHER PEOPLE'S PUBLIC PAGES (Alternative approach)
async function getPublicPagePosts(req, res) {
    const { pageId } = req.params; // Any public page ID
    
    try {
        // Try multiple approaches due to Facebook permission restrictions
        
        // Approach 1: Try with User Access Token (if available)
        if (process.env.FB_USER_ACCESS_TOKEN) {
            try {
                const response = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
                    params: {
                        fields: 'message,created_time,full_picture,permalink_url,story',
                        access_token: process.env.FB_USER_ACCESS_TOKEN,
                        limit: 20
                    }
                });
                
                return res.json({
                    success: true,
                    page_id: pageId,
                    data: response.data.data,
                    method: 'user_token',
                    note: 'Public page posts via user token'
                });
            } catch (userTokenError) {
                console.log('User token failed, trying app token...');
            }
        }
        
        // Approach 2: Try basic page info only (this usually works)
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        const pageInfoResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
            params: {
                fields: 'id,name,about,category,fan_count,picture,link,website',
                access_token: appToken
            }
        });
        
        res.json({
            success: true,
            page_id: pageId,
            page_info: pageInfoResponse.data,
            posts_data: null,
            note: 'Page info only - posts require additional permissions',
            permission_error: true,
            solutions: [
                'Add "Page Public Content Access" feature to your Facebook app',
                'Get app reviewed by Facebook for pages_read_engagement permission',
                'Use the page owner\'s page access token instead'
            ]
        });
        
    } catch (error) {
        console.error('Public Page API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message,
            error_code: error.response?.data?.error?.code,
            solutions: [
                'Make sure the page exists and is public',
                'Add required permissions to your Facebook app',
                'Use a valid user access token that has liked/followed the page'
            ]
        });
    }
}

// Alternative: Get Facebook page data that works with current API restrictions
async function getAccessiblePageData(req, res) {
    const { pageId } = req.params;
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        // This usually works - basic page information
        const pageResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
            params: {
                fields: 'id,name,about,category,fan_count,picture.width(200),cover,link,website,phone,location,hours,description',
                access_token: appToken
            }
        });
        
        // Try to get recent activity (sometimes works)
        let recentActivity = null;
        try {
            const activityResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
                params: {
                    fields: 'created_time,story,type',
                    access_token: appToken,
                    limit: 5
                }
            });
            recentActivity = activityResponse.data.data;
        } catch (activityError) {
            console.log('Recent activity not accessible:', activityError.response?.data?.error?.message);
        }
        
        res.json({
            success: true,
            page_info: pageResponse.data,
            recent_activity: recentActivity,
            accessible_data_note: 'Full post content requires additional permissions',
            workarounds: {
                rss_feed: `Try checking if RSS feed exists: https://www.facebook.com/feeds/page.php?id=${pageId}&format=rss20`,
                instagram_alternative: 'Check if the page has an Instagram account for public posts',
                manual_scraping: 'Consider web scraping for public content (check terms of service)',
                api_permissions: 'Request Page Public Content Access feature in Facebook App Review'
            }
        });
        
    } catch (error) {
        console.error('Page access error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: error.response?.data?.error?.message || error.message,
            facebook_api_status: 'Facebook has restricted public page access since 2018',
            current_solutions: [
                '1. Own the page (use page access token)',
                '2. Get user consent (use user access token)',
                '3. Apply for Page Public Content Access feature',
                '4. Use alternative data sources (Instagram, RSS, etc.)'
            ]
        });
    }
}

// Check what permissions your current tokens have
async function checkTokenPermissions(req, res) {
    try {
        const results = {};
        
        // Check App Token permissions
        if (process.env.FB_APP_ID && process.env.FB_APP_SECRET) {
            const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
            try {
                const appResponse = await axios.get(`https://graph.facebook.com/v18.0/me`, {
                    params: { access_token: appToken }
                });
                results.app_token = { status: 'valid', data: appResponse.data };
            } catch (error) {
                results.app_token = { status: 'error', message: error.response?.data?.error?.message };
            }
        }
        
        // Check User Token permissions
        if (process.env.FB_USER_ACCESS_TOKEN) {
            try {
                const userResponse = await axios.get(`https://graph.facebook.com/v18.0/me/permissions`, {
                    params: { access_token: process.env.FB_USER_ACCESS_TOKEN }
                });
                results.user_token = { 
                    status: 'valid', 
                    permissions: userResponse.data.data,
                    has_pages_permission: userResponse.data.data.some(p => p.permission === 'pages_read_engagement' && p.status === 'granted')
                };
            } catch (error) {
                results.user_token = { status: 'error', message: error.response?.data?.error?.message };
            }
        }
        
        // Check Page Token permissions
        if (process.env.FB_PAGE_ACCESS_TOKEN) {
            try {
                const pageResponse = await axios.get(`https://graph.facebook.com/v18.0/me`, {
                    params: { access_token: process.env.FB_PAGE_ACCESS_TOKEN }
                });
                results.page_token = { status: 'valid', data: pageResponse.data };
            } catch (error) {
                results.page_token = { status: 'error', message: error.response?.data?.error?.message };
            }
        }
        
        res.json({
            success: true,
            token_status: results,
            recommendations: {
                for_own_pages: 'Use Page Access Token',
                for_public_pages: 'Need Page Public Content Access feature approval',
                for_user_content: 'Use User Access Token with proper permissions'
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

// Search for public pages and their recent posts (Free)
async function searchPublicPages(req, res) {
    const { query } = req.query; // Search term
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        // First, search for pages
        const searchResponse = await axios.get(`https://graph.facebook.com/v18.0/search`, {
            params: {
                q: query,
                type: 'page',
                fields: 'id,name,about,category,fan_count,picture',
                access_token: appToken,
                limit: 10
            }
        });
        
        // Then get posts from found pages
        const pagesWithPosts = await Promise.all(
            searchResponse.data.data.slice(0, 3).map(async (page) => {
                try {
                    const postsResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}/posts`, {
                        params: {
                            fields: 'message,created_time,permalink_url',
                            access_token: appToken,
                            limit: 5
                        }
                    });
                    
                    return {
                        ...page,
                        recent_posts: postsResponse.data.data
                    };
                } catch (error) {
                    return {
                        ...page,
                        recent_posts: [],
                        error: 'Posts not accessible'
                    };
                }
            })
        );
        
        res.json({
            success: true,
            search_query: query,
            pages: pagesWithPosts
        });
    } catch (error) {
        console.error('Search API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

// Get specific post details from any public post (Free)
async function getFacebookPostDetails(req, res) {
    const { postId } = req.params;
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        const response = await axios.get(`https://graph.facebook.com/v18.0/${postId}`, {
            params: {
                fields: 'message,created_time,full_picture,permalink_url,story,likes.summary(true),comments.summary(true),shares',
                access_token: appToken // Use app token for public posts
            }
        });
        
        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Facebook API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

// Helper function to get page ID from page URL or username
async function getPageIdFromUsername(req, res) {
    const { username } = req.params; // e.g., "nike", "coca-cola"
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        const response = await axios.get(`https://graph.facebook.com/v18.0/${username}`, {
            params: {
                fields: 'id,name,about,category,fan_count,picture,link',
                access_token: appToken
            }
        });
        
        res.json({
            success: true,
            page_info: response.data,
            note: 'Use the "id" field to get posts from this page'
        });
    } catch (error) {
        console.error('Page lookup error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

// Static Facebook posts - Predefined posts for NUConnect Mobile
async function getStaticFacebookPosts(req, res) {
    try {
        const staticPosts = [
            {
                id: "post_1",
                message: `𝗧𝗛𝗘 𝗠𝗘𝗡𝗧𝗢𝗥𝗦 𝗪𝗛𝗢 𝗣𝗥𝗢𝗚𝗥𝗔𝗠𝗦 𝗙𝗨𝗧𝗨𝗥𝗘

They are the guiding lights who debug our doubts, the architects who design pathways to success, and the mentors who teach us that the greatest system we can build is ourselves.

Like true innovators, they don't just share knowledge—they 𝗰𝗼𝗺𝗽𝗶𝗹𝗲 𝘄𝗶𝘀𝗱𝗼𝗺, 𝘂𝗽𝗴𝗿𝗮𝗱𝗲 𝗽𝗼𝘁𝗲𝗻𝘁𝗶𝗮𝗹, 𝗮𝗻𝗱 𝗲𝘅𝗲𝗰𝘂𝘁𝗲 𝗶𝗻𝘀𝗽𝗶𝗿𝗮𝘁𝗶𝗼𝗻 every single day.  

To our professors, thank you for shaping not just our skills, but also our mindset to thrive in a world driven by technology.   

  𝘛𝘢𝘨 𝘵𝘩𝘦 𝘱𝘳𝘰𝘧𝘦𝘴𝘴𝘰𝘳 𝘸𝘩𝘰 𝘩𝘢𝘴 𝘪𝘯𝘴𝘱𝘪𝘳𝘦𝘥 𝘺𝘰𝘶𝘳 𝘫𝘰𝘶𝘳𝘯𝘦𝘺 𝘢𝘯𝘥 𝘥𝘳𝘰𝘱 𝘺𝘰𝘶𝘳 𝘮𝘦𝘴𝘴𝘢𝘨𝘦 𝘰𝘧 𝘨𝘳𝘢𝘵𝘪𝘵𝘶𝘥𝘦!
—
𝗚𝗿𝗮𝗽𝗵𝗶𝗰𝘀 𝗕𝘆:
Kylex Valenzuela

𝗖𝗮𝗽𝘁𝗶𝗼𝗻 𝗕𝘆:
Anjobhel Achas

#NUDasmariñasComputerSociety
#NUDasmariñas
#EducationThatWorks
#CIT
#TeachersDay`,
                created_time: "2025-01-15T10:00:00+0000",
                full_picture: "https://scontent.fmnl25-1.fna.fbcdn.net/v/t39.30808-6/558901464_822960113569833_4378716190953479526_n.jpg?_nc_cat=103&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeG_qIwncpCglf8jDvqYPYnJ1glE1SMkeFDWCUTVIyR4ULnLKA3fZ-mx45xDe6LSck3GnjWiKm-nJzapj0EFyGfD&_nc_ohc=qoaKtUkczx0Q7kNvwFsuQcA&_nc_oc=AdkNGSqBgOExRCdsCMt0VDrKfjbdVn9Ihlwp8bjqawOUmMt-6i30xlHTiA08Z7VGOTE&_nc_zt=23&_nc_ht=scontent.fmnl25-1.fna&_nc_gid=rsWAqu102lNQU9-3P9ztOQ&oh=00_Afe-He_3F_AFnxLzm-wtj37wwELUGGIC0IsKmIMy27WvyQ&oe=68F61999",
                permalink_url: "https://www.facebook.com/photo/?fbid=822960110236500&set=a.186272223905295",
                organization: "NU Dasmariñas Computer Society",
                hashtags: ["NUDasmariñasComputerSociety", "NUDasmariñas", "EducationThatWorks", "CIT", "TeachersDay"]
            },
            {
                id: "post_2",
                message: `The NU Dasmariñas ENYUMANCERS jumped into the action for the first time at the DICT - HackForGov Calabarzon Region event! The team tested their skills in ethical hacking against schools across the region.

Coach: Charlyn A. Malimata
Team Leader: Jerine Acebes
Members: 
Aivan Ross Anuyo
Emman Bawalan 
Paul Emerson Biag

 Malvar, Batangas
#NUDasmariñas #HackforGov #isitenudchapter`,
                created_time: "2025-01-14T14:30:00+0000",
                full_picture: "https://scontent.fmnl25-4.fna.fbcdn.net/v/t39.30808-6/557534736_122244291470130012_2256333990468743317_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeHd-SP58YDeKN_OrLGG7StNj5k5sHFGzpyPmTmwcUbOnF8fK-kk-pjANHmxQojnWJH6KPCjx1NK8S1NI_nnqqfp&_nc_ohc=0_HTR8yI-00Q7kNvwHR6YvE&_nc_oc=Adm48B_brKTTEP9CtKhcsfffH3wk7OG-UNVP24dhhGvrL7Dhf-42r9DE1zYJ5a75sa4&_nc_zt=23&_nc_ht=scontent.fmnl25-4.fna&_nc_gid=BaP6R0wg7EoNx2Fp8_RZYA&oh=00_AfdjeE9pMXJT6LkvG-k6D72tGGv60dhsTY1pbKd0SROcQA&oe=68F61957",
                permalink_url: "https://www.facebook.com/photo/?fbid=122244291464130012&set=pcb.122244259832130012",
                organization: "NU Dasmariñas iSite",
                hashtags: ["NUDasmariñas", "HackforGov", "isitenudchapter"]
            },
            {
                id: "post_3",
                message: ` 𝗣𝗢𝗜𝗡𝗧, 𝗖𝗟𝗜𝗖𝗞, 𝗔𝗔𝗔𝗡𝗗 𝗔𝗡𝗢𝗧𝗛𝗘𝗥 𝗢𝗡𝗘 𝗙𝗢𝗥 𝗧𝗛𝗘 𝗖𝗛𝗔𝗣𝗧𝗘𝗥 𝗢𝗙 𝗬𝗢𝗨𝗥 𝗟𝗜𝗙𝗘!

Spotlight's on one of our creative minds — happy birthday to Carljohn Rodriguez, our Documentation and Archives Associate!  

Your dedication in capturing moments and preserving JBECP's milestones keeps our story alive and inspiring. Every photo, every record, and every detail you've handled tells a part of who we are and what we stand for — innovation, collaboration, and growth.  

May your day be filled with creativity, laughter, and achievements worth documenting! Thank you for being a valuable part of the team, and here's to more memories made and captured ahead.  

#JBECPNUDasma
#JBECP
#Blockchain
#Web3
#OneBlockAtATime

 : Paolo Eduardo
 : Winter Batitis`,
                created_time: "2025-01-13T09:00:00+0000",
                full_picture: "https://scontent.fmnl25-1.fna.fbcdn.net/v/t39.30808-6/560726297_122172315674441288_6688574343460918594_n.jpg?stp=dst-jpg_p180x540_tt6&_nc_cat=103&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeGZuNVyU-TwpIrUjFgwmy1Wbr7VDncmEpZuvtUOdyYSll2yYDgMmQURXwyVEcZi9YlPpomfDBAhJnEWPixNBr-Z&_nc_ohc=x5uz6jOCfuQQ7kNvwHYLK__&_nc_oc=AdkA9XYFPKe9SZ2SJ18eg-fno3A3S4FXJk5h_ushLX5QHtPwWLjX50ubiWbsuXPLfLM&_nc_zt=23&_nc_ht=scontent.fmnl25-1.fna&_nc_gid=_fL9vhi7TTic9M8uryj2lA&oh=00_Aff_r-LVvTOCtUYDGDKN5umw_iZJCwV-rtgFDAhiMv-C5g&oe=68F60F03",
                permalink_url: "https://www.facebook.com/photo/?fbid=122172315668441288&set=a.122105635052441288",
                organization: "JBECP NU Dasma",
                hashtags: ["JBECPNUDasma", "JBECP", "Blockchain", "Web3", "OneBlockAtATime"]
            },
            {
                id: "post_4",
                message: `Project Lingap: Hygiene and Care Program for the Elderly
 Father Saturnino Lopez Homes

Project Lingap brought together the CIT Community Extension Office, NUD Computer Society, NUD iSite, and our Microsoft Student Community – NUD in the spirit of care and community.

We came to share hygiene essentials, but we left carrying with us the stories and kindness of the elderly who welcomed us with open hearts.

We are deeply thankful to Father Saturnino Lopez Homes for allowing us to share this experience. It was a day that reminded us how service becomes most meaningful when it is rooted in respect and compassion.  

#ProjectLingap #MSCommunityNUD #NUDComputerSociety #NUDiSite`,
                created_time: "2025-01-12T16:45:00+0000",
                full_picture: "https://scontent.fmnl25-4.fna.fbcdn.net/v/t39.30808-6/558362443_122179797428477806_291138381075858047_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeGuRVgeCn_MdRfw9zodZ_Ry3sO5Sioe7jLew7lKKh7uMqQM0hZ_yy5WyRQf6OYBpDp2SQMF2XgRORYXMaRff2dk&_nc_ohc=FEUOLHySSlkQ7kNvwH__QkB&_nc_oc=Adm0EXPElvDjDaYfwEt3td6lase6tnxEFH08K1wTlU7ylnuJbOIkA_bXPCyrJcRE2Fs&_nc_zt=23&_nc_ht=scontent.fmnl25-4.fna&_nc_gid=EX6v9PAIWA2SrmlpBg0Srg&oh=00_AfemXZI81EFddLggjvhVjNKKL48wnETZM2hF7XabByeX-g&oe=68F5E912",
                permalink_url: "https://www.facebook.com/MSCNUD/posts/pfbid0v13EwH4weuU7H1UYrURKASsr2SHdh3wpWpMZ7BkR9Vk99ocjZCEghrLZvUXvcz7Ll",
                organization: "Microsoft Student Community - NUD",
                hashtags: ["ProjectLingap", "MSCommunityNUD", "NUDComputerSociety", "NUDiSite"]
            },
            {
                id: "post_5",
                message: `𝐇𝐚𝐩𝐩𝐲 𝐖𝐨𝐫𝐥𝐝 𝐓𝐞𝐚𝐜𝐡𝐞𝐫𝐬' 𝐃𝐚𝐲!

As we celebrate the perseverance and great service of our professors in the teaching field. Let us not forget the remarkable figures behind the CIT Department of National University - Dasmariñas.  

May your 𝐩𝐚𝐬𝐬𝐢𝐨𝐧 shines the 𝐛𝐫𝐢𝐠𝐡𝐭𝐞𝐬𝐭 and your 𝐞𝐧𝐭𝐡𝐮𝐬𝐢𝐚𝐬𝐦 alive in every delightful moments you pursue your calling.   

 : Mark Joseph E. Dita
 : Celjay Pasturin

#WorldTeachersDay
#JPCSNUDasmariñas
#DigitalAscend
#DrivingChangeThatCarvesNewGrounds`,
                created_time: "2025-01-11T11:20:00+0000",
                full_picture: "https://scontent.fmnl25-7.fna.fbcdn.net/v/t39.30808-6/557722848_773852322190995_2368959688248606928_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=127cfc&_nc_eui2=AeHZsceggik-qvqjfVEsQSykW7nZhT1cgTZbudmFPVyBNvUedonIf5IFHsWN_DBzUAQDKn46QZpq2iCgQ4pHqtvq&_nc_ohc=slI98NdRkVUQ7kNvwFFZkpq&_nc_oc=Adm81s02dyVRYCNlJfEI89CrQuWqb6aQi0XR_DqXiUwbO0FW24xJsqeibSqEep8UJgE&_nc_zt=23&_nc_ht=scontent.fmnl25-7.fna&_nc_gid=CpBmfSRELdwms-kL_mauaA&oh=00_Afegq_GyNR63KbW5DCl1nPJTxnqyN7BqW4URl5RKScl6oA&oe=68F61A67",
                permalink_url: "https://www.facebook.com/photo?fbid=773852318857662&set=a.234806926095540",
                organization: "JPCS NU Dasmariñas",
                hashtags: ["WorldTeachersDay", "JPCSNUDasmariñas", "DigitalAscend", "DrivingChangeThatCarvesNewGrounds"]
            }
        ];

        res.json({
            success: true,
            data: staticPosts,
            count: staticPosts.length,
            source: "static",
            message: "Static Facebook posts loaded successfully"
        });
    } catch (error) {
        console.error('Static Posts Error:', error.message);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
}

module.exports = { 
    getFacebookPosts,
    getPublicPagePosts,
    getAccessiblePageData,
    searchPublicPages,
    getFacebookPostDetails,
    getPageIdFromUsername,
    checkTokenPermissions,
    getStaticFacebookPosts
};
