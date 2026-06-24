import { PrismaClient } from './lib/generated/prisma/client';
const prisma = new PrismaClient();

async function getOrganizations(user_id: string) {
    const organizations = await prisma.tbl_organization.findMany({
        where: { status: 'Approved' },
        include: {
            tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
                include: {
                    tbl_organization_members: {
                        where: {
                            status: { in: ['Active', 'Pending'] }
                        },
                        include: {
                            tbl_user: {
                                select: { f_name: true, l_name: true, profile_picture: true }
                            },
                            tbl_executive_role: {
                                select: { role_title: true }
                            }
                        }
                    }
                }
            },
            tbl_event: {
                where: { start_date: { gte: new Date() } },
                orderBy: { start_date: 'asc' },
                take: 5
            }
        }
    });

    const result = organizations.map(org => {
        const version = org.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;
        if (!version) return null;

        const allMembers = version.tbl_organization_members || [];
        
        // Find user's membership status
        const userMember = allMembers.find(m => m.user_id === user_id);
        const membershipStatus = userMember ? userMember.status : 'Not Member';

        // Get total active members
        const activeMembers = allMembers.filter(m => m.status === 'Active');

        // Extract officers
        const officers = activeMembers
            .filter(m => m.executive_role_id != null && m.tbl_executive_role)
            .map(m => ({
                f_name: m.tbl_user?.f_name || '',
                l_name: m.tbl_user?.l_name || '',
                role_name: m.tbl_executive_role?.role_title || '',
                profile_picture: m.tbl_user?.profile_picture || ''
            }));

        // Extract member names for avatar (just simple members, up to 3)
        const memberNames = activeMembers
            .filter(m => m.executive_role_id == null) // Regular members
            .map(m => ({
                first_name: m.tbl_user?.f_name || '',
                last_name: m.tbl_user?.l_name || ''
            })).slice(0, 3);

        // Map upcoming events
        const upcomingEvents = (org.tbl_event || []).map(e => ({
            event_id: e.event_id,
            venue: e.venue || '',
            start_time: e.start_date.toISOString().split('T')[1].substring(0, 8),
            end_time: e.end_date.toISOString().split('T')[1].substring(0, 8),
            event_start_date: e.start_date.toISOString().split('T')[0],
            event_title: e.title,
            total_attendees: 0 // Simplification for now
        }));

        return {
            organization_id: org.organization_id,
            organization_name: org.name,
            logo: version.logo_path,
            organization_version_id: version.org_version_id,
            total_members: activeMembers.length,
            organization_type: version.category,
            organization_description: version.description,
            membership_status: membershipStatus === 'Pending' ? 'Pending' : (membershipStatus === 'Active' ? 'Member' : 'Not Member'),
            is_recruiting: version.is_recruiting ? 1 : 0,
            membership_fee_amount: version.membership_fee_amount ? Number(version.membership_fee_amount) : 0,
            membership_fee_type: version.membership_fee_type,
            officers: officers,
            upcoming_events: upcomingEvents,
            member_names: memberNames
        };
    }).filter(Boolean);

    return result;
}

async function run() {
    const orgs = await getOrganizations('00000000-0000-0000-0000-000000000000'); // Dummy ID
    console.log(JSON.stringify(orgs, null, 2));
    await prisma.$disconnect();
}

run().catch(console.error);
