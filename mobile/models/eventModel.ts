// @ts-nocheck
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { prisma } = require('../../config/db');
const { redisClient } = require('../../config/redis');

function extractOrganizationIds(organizations) {
    if (!Array.isArray(organizations)) return [];

    const ids = organizations
        .map((entry) => {
            if (typeof entry === 'number') return entry;
            if (typeof entry === 'string') return Number(entry);
            if (entry && typeof entry === 'object') {
                return Number(entry.organization_id ?? entry.organizationId);
            }
            return NaN;
        })
        .filter((id) => Number.isInteger(id) && id > 0);

    return [...new Set(ids)];
}

function toTimeString(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(11, 19);
}

function mapEventForMobile(row) {
    const schedules = Array.isArray(row.tbl_event_schedule) ? row.tbl_event_schedule : [];
    const firstSchedule = schedules[0] || null;

    const attendeeNames = (row.tbl_event_attendance || [])
        .map((attendance) => {
            const first = attendance?.tbl_user?.f_name || '';
            const last = attendance?.tbl_user?.l_name || '';
            const full = `${first} ${last}`.trim();
            return full || attendance?.tbl_user?.email || null;
        })
        .filter(Boolean);

    const org = row.tbl_organization;
    const currentVersion = org?.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;

    return {
        event_id: row.event_id,
        title: row.title,
        date: firstSchedule?.date || row.start_date,
        start_time: toTimeString(firstSchedule?.start_time),
        end_time: toTimeString(firstSchedule?.end_time),
        venue: row.venue || (firstSchedule?.tbl_event_schedule_venue || [])
            .map((v) => v?.tbl_venue?.name)
            .filter(Boolean)
            .join(', '),
        status: row.status,
        organization_name: org?.name || '',
        organization_id: row.organization_id,
        organization_version_id: org?.current_org_version_id || currentVersion?.org_version_id || null,
        image: row.image || null,
        organization_logo: currentVersion?.logo_path || null,
        total_attendees: attendeeNames.length,
        attendee_names: attendeeNames,
        schedules: schedules.map((schedule) => ({
            date: schedule.date,
            start_time: toTimeString(schedule.start_time),
            end_time: toTimeString(schedule.end_time),
            venues: (schedule.tbl_event_schedule_venue || [])
                .map((v) => v?.tbl_venue?.name)
                .filter(Boolean),
        })),
    };
}

async function getAllEvents(organizations) {
    const organizationIds = extractOrganizationIds(organizations);
    if (!organizationIds.length) return [];

    const rows = await prisma.tbl_event.findMany({
        where: {
            organization_id: { in: organizationIds },
        },
        orderBy: [
            { start_date: 'desc' },
            { event_id: 'desc' },
        ],
        select: {
            event_id: true,
            title: true,
            start_date: true,
            end_date: true,
            venue: true,
            status: true,
            image: true,
            organization_id: true,
            tbl_organization: {
                select: {
                    name: true,
                    current_org_version_id: true,
                    tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
                        select: {
                            org_version_id: true,
                            logo_path: true,
                        },
                    },
                },
            },
            tbl_event_schedule: {
                orderBy: [
                    { date: 'asc' },
                    { start_time: 'asc' },
                ],
                select: {
                    date: true,
                    start_time: true,
                    end_time: true,
                    tbl_event_schedule_venue: {
                        select: {
                            tbl_venue: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
            },
            tbl_event_attendance: {
                where: { deleted_at: null },
                select: {
                    tbl_user: {
                        select: {
                            f_name: true,
                            l_name: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });

    return rows.map(mapEventForMobile);
}

function mapAttendanceStatus(status, hasEvaluation = false) {
    if (hasEvaluation) return 'Evaluated';
    if (!status) return 'Registered';
    return String(status);
}

function mapPaymentStatus(status) {
    if (!status) return null;
    const normalized = String(status).trim();
    if (normalized === 'Completed') return 'Completed';
    if (normalized === 'Failed') return 'Failed';
    return 'Pending';
}

function mapSpecificEventForMobile(row, userId) {
    if (!row) return null;

    const schedules = Array.isArray(row.tbl_event_schedule) ? row.tbl_event_schedule : [];
    const firstSchedule = schedules[0] || null;
    const org = row.tbl_organization;
    const currentVersion = org?.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;
    const attendee = (row.tbl_event_attendance || []).find((a) => a.user_id === userId);
    const tx = attendee?.tbl_transaction || null;
    const paymentStatus = mapPaymentStatus(tx?.status);
    const paidAmount = tx?.amount != null ? Number(tx.amount) : null;
    const paymentDate = tx?.transaction_date || null;
    const paymentRemarks = tx?.remarks || null;
    const proofImage = tx?.proof_image || null;
    const transactionId = attendee?.transaction_id ?? null;
    const studentStatus = attendee ? mapAttendanceStatus(attendee.status) : '';

    return {
        event_id: row.event_id,
        title: row.title,
        description: row.description,
        event_type: row.event_type,
        is_open_to: row.is_open_to,
        type: row.type,
        fee: row.fee,
        capacity: row.capacity,
        start_date: row.start_date,
        end_date: row.end_date,
        date: firstSchedule?.date || row.start_date,
        start_time: toTimeString(firstSchedule?.start_time),
        end_time: toTimeString(firstSchedule?.end_time),
        venue: row.venue || (firstSchedule?.tbl_event_schedule_venue || [])
            .map((v) => v?.tbl_venue?.name)
            .filter(Boolean)
            .join(', '),
        status: row.status,
        image: row.image || null,
        organization_id: row.organization_id,
        organization_name: org?.name || '',
        organization_version_id: org?.current_org_version_id || currentVersion?.org_version_id || null,
        organization_logo: currentVersion?.logo_path || null,
        can_join_if_unpaid: true,
        is_paid_on_term: true,
        is_registered: Boolean(attendee),
        attendance_status: studentStatus,
        transaction_id: transactionId,
        transactionId,
        studentStatus,
        paymentStatus,
        paidAmount,
        proofImage,
        paymentDate,
        paymentRemarks,
        schedules: schedules.map((schedule) => ({
            date: schedule.date,
            start_time: toTimeString(schedule.start_time),
            end_time: toTimeString(schedule.end_time),
            venues: (schedule.tbl_event_schedule_venue || [])
                .map((v) => v?.tbl_venue?.name)
                .filter(Boolean),
        })),
    };
}

async function registerEvent(event_id, user_id, status, transaction_id) {
    const existing = await prisma.tbl_event_attendance.findFirst({
        where: {
            event_id: Number(event_id),
            user_id,
            deleted_at: null,
        },
        select: { attendance_id: true, status: true },
    });

    if (existing) {
        if (existing.status === 'Rejected') {
            return prisma.tbl_event_attendance.update({
                where: { attendance_id: existing.attendance_id },
                data: {
                    transaction_id: transaction_id ? Number(transaction_id) : null,
                    status: status || 'Registered',
                    updated_at: new Date(),
                },
            });
        }
        return null;
    }

    const created = await prisma.tbl_event_attendance.create({
        data: {
            event_id: Number(event_id),
            user_id,
            transaction_id: transaction_id ? Number(transaction_id) : null,
            status: status || 'Registered',
        },
    });

    return created;
}

async function unregisterEvent(event_id, user_id) {
    const existing = await prisma.tbl_event_attendance.findFirst({
        where: {
            event_id: Number(event_id),
            user_id,
            deleted_at: null,
        },
        orderBy: { attendance_id: 'desc' },
    });

    if (!existing) return null;

    return prisma.tbl_event_attendance.update({
        where: { attendance_id: existing.attendance_id },
        data: {
            deleted_at: new Date(),
            status: 'Rejected',
            updated_at: new Date(),
        },
    });
}

async function checkEventRegistration(event_id, user_id) {
    return prisma.tbl_event_attendance.findFirst({
        where: {
            event_id: Number(event_id),
            user_id,
            deleted_at: null,
            status: { not: 'Rejected' },
        },
        select: {
            attendance_id: true,
            status: true,
            transaction_id: true,
        },
    });
}

async function getSpecificEvent(eventId, userId) {
    const row = await prisma.tbl_event.findUnique({
        where: { event_id: Number(eventId) },
        select: {
            event_id: true,
            title: true,
            description: true,
            event_type: true,
            is_open_to: true,
            type: true,
            fee: true,
            capacity: true,
            start_date: true,
            end_date: true,
            venue: true,
            status: true,
            image: true,
            organization_id: true,
            tbl_organization: {
                select: {
                    name: true,
                    current_org_version_id: true,
                    tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
                        select: {
                            org_version_id: true,
                            logo_path: true,
                        },
                    },
                },
            },
            tbl_event_schedule: {
                orderBy: [{ date: 'asc' }, { start_time: 'asc' }],
                select: {
                    date: true,
                    start_time: true,
                    end_time: true,
                    tbl_event_schedule_venue: {
                        select: {
                            tbl_venue: {
                                select: { name: true },
                            },
                        },
                    },
                },
            },
            tbl_event_attendance: {
                where: { deleted_at: null },
                select: {
                    user_id: true,
                    status: true,
                    transaction_id: true,
                    tbl_transaction: {
                        select: {
                            transaction_id: true,
                            status: true,
                            amount: true,
                            transaction_date: true,
                            proof_image: true,
                            remarks: true,
                        },
                    },
                },
            },
        },
    });

    return mapSpecificEventForMobile(row, userId);
}

async function getTickets(user_id, event_id = null) {
    const where = {
        user_id,
        deleted_at: null,
    };

    if (event_id != null) {
        where.event_id = Number(event_id);
    }

    const rows = await prisma.tbl_event_attendance.findMany({
        where,
        orderBy: { created_at: 'desc' },
        select: {
            attendance_id: true,
            event_id: true,
            status: true,
            transaction_id: true,
            created_at: true,
            tbl_event: {
                select: {
                    title: true,
                    start_date: true,
                    end_date: true,
                    image: true,
                },
            },
        },
    });

    return rows.map((row) => {
        const qr_token = jwt.sign(
            { 
                eid: row.event_id, 
                uid: user_id, 
                typ: 'evt_tix' 
            }, 
            process.env.JWT_SECRET_KEY || 'default_secret', 
            { expiresIn: '30d' }
        );

        return {
            attendance_id: row.attendance_id,
            event_id: row.event_id,
            status: row.status,
            transaction_id: row.transaction_id,
            created_at: row.created_at,
            title: row.tbl_event?.title || '',
            start_date: row.tbl_event?.start_date || null,
            end_date: row.tbl_event?.end_date || null,
            image: row.tbl_event?.image || null,
            qr_token,
        };
    });
}
async function getUpcomingEvents(organizations) {
    const organizationIds = extractOrganizationIds(organizations);
    if (!organizationIds.length) return [];

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const rows = await prisma.tbl_event.findMany({
        where: {
            organization_id: { in: organizationIds },
            end_date: { gte: now },
        },
        orderBy: [
            { start_date: 'asc' },
            { event_id: 'asc' },
        ],
        select: {
            event_id: true,
            title: true,
            start_date: true,
            end_date: true,
            venue: true,
            status: true,
            image: true,
            organization_id: true,
            tbl_organization: {
                select: {
                    name: true,
                    current_org_version_id: true,
                    tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
                        select: {
                            org_version_id: true,
                            logo_path: true,
                        },
                    },
                },
            },
            tbl_event_schedule: {
                orderBy: [
                    { date: 'asc' },
                    { start_time: 'asc' },
                ],
                select: {
                    date: true,
                    start_time: true,
                    end_time: true,
                    tbl_event_schedule_venue: {
                        select: {
                            tbl_venue: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
            },
            tbl_event_attendance: {
                where: { deleted_at: null },
                select: {
                    tbl_user: {
                        select: {
                            f_name: true,
                            l_name: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });

    return rows.map(mapEventForMobile);
}

async function addGeneratedCertificate({ event_id, template_id, pdfFilename, verification_code, user_id }) {
    if (!user_id) {
        const firstAttendee = await prisma.tbl_event_attendance.findFirst({
            where: { event_id: Number(event_id), deleted_at: null },
            orderBy: { created_at: 'asc' },
            select: { user_id: true },
        });
        user_id = firstAttendee?.user_id || null;
    }

    if (!user_id) {
        throw new Error('Unable to resolve certificate user_id');
    }

    return prisma.tbl_event_certificate.create({
        data: {
            event_id: Number(event_id),
            user_id,
            template_id: Number(template_id),
            certificate_path: pdfFilename,
            verification_code,
        },
    });
}

async function getEvaluation(event_id) {
    const groups = await prisma.tbl_event_evaluation_config.findMany({
        where: { event_id: Number(event_id) },
        select: {
            group_id: true,
            tbl_evaluation_question_group: {
                select: {
                    group_id: true,
                    group_title: true,
                    group_description: true,
                    tbl_evaluation_question: {
                        select: {
                            question_id: true,
                            question_text: true,
                            question_type: true,
                            is_required: true,
                        },
                        orderBy: { question_id: 'asc' },
                    },
                },
            },
        },
        orderBy: { group_id: 'asc' },
    });

    const form = groups.map((row) => ({
        group_id: row.tbl_evaluation_question_group?.group_id,
        group_title: row.tbl_evaluation_question_group?.group_title || '',
        group_description: row.tbl_evaluation_question_group?.group_description || null,
        questions: row.tbl_evaluation_question_group?.tbl_evaluation_question || [],
    }));

    return [
        {
            evaluation_form: form,
        }
    ];
}

async function submitEvaluation(response) {
    const event_id = Number(response?.event_id || response?.eventId);
    let user_id = response?.user_id || response?.userId || response?.submitted_by;

    if (!user_id) {
        const fallbackEmail = response?.email || response?.user_email || response?.userEmail;
        if (fallbackEmail) {
            const user = await prisma.tbl_user.findUnique({
                where: { email: String(fallbackEmail) },
                select: { user_id: true },
            });
            user_id = user?.user_id;
        }
    }
    let responses = Array.isArray(response?.responses)
        ? response.responses
        : Array.isArray(response?.answers)
            ? response.answers
            : [];

    if (Array.isArray(response?.likert_scale)) {
        responses = responses.concat(response.likert_scale);
    }
    if (Array.isArray(response?.text_answers)) {
        responses = responses.concat(response.text_answers);
    }

    if (!event_id || !user_id || !responses.length) {
        throw new Error('Invalid evaluation payload');
    }

    const evaluation = await prisma.tbl_evaluation.create({
        data: {
            event_id,
            user_id,
            duration_seconds: Number(response?.duration_seconds || response?.durationSeconds) || null,
        },
        select: { evaluation_id: true },
    });

    const inserts = responses
        .map((entry) => {
            const question_id = Number(entry.question_id || entry.questionId);
            if (!question_id) return null;
            const value = entry.response_value ?? entry.responseValue ?? entry.value ?? entry.answer ?? '';
            return {
                evaluation_id: evaluation.evaluation_id,
                question_id,
                response_value: String(value),
            };
        })
        .filter(Boolean);

    if (inserts.length) {
        await prisma.tbl_evaluation_response.createMany({ data: inserts });
    }
}

async function getCertificateTemplate(event_id) {
    return prisma.tbl_certificate_template.findMany({
        where: { event_id: Number(event_id) },
        select: {
            template_id: true,
            template_path: true,
            event_id: true,
        },
        take: 1,
    });
}
async function getAllEventCertificates(user_id) {
    return prisma.tbl_event_certificate.findMany({
        where: { user_id },
        orderBy: { issued_at: 'desc' },
        select: {
            certificate_id: true,
            event_id: true,
            template_id: true,
            certificate_path: true,
            verification_code: true,
            issued_at: true,
            tbl_event: {
                select: {
                    title: true,
                    start_date: true,
                    organization_id: true,
                    image: true,
                    tbl_organization: {
                        select: {
                            current_org_version_id: true,
                        },
                    },
                },
            },
        },
    }).then((rows) => rows.map((row) => ({
        ...row,
        tbl_event: {
            ...row.tbl_event,
            organization_version_id: row.tbl_event?.tbl_organization?.current_org_version_id ?? null,
        },
    })));
}

async function scanTicket(email, event_id,  user_id) {
    const targetUser = await prisma.tbl_user.findUnique({
        where: { email },
        select: { user_id: true, f_name: true, l_name: true, email: true },
    });

    if (!targetUser) return null;

    const attendance = await prisma.tbl_event_attendance.findFirst({
        where: {
            event_id: Number(event_id),
            user_id: targetUser.user_id,
            deleted_at: null,
        },
        orderBy: { attendance_id: 'desc' },
    });

    if (!attendance) return null;

    const now = new Date();
    const updated = await prisma.tbl_event_attendance.update({
        where: { attendance_id: attendance.attendance_id },
        data: {
            status: 'Attended',
            time_in: attendance.time_in || now,
            time_out: attendance.time_in ? now : attendance.time_out,
            updated_at: now,
        },
    });

    return {
        attendance_id: updated.attendance_id,
        event_id: updated.event_id,
        user_id: updated.user_id,
        status: updated.status,
        time_in: updated.time_in,
        time_out: updated.time_out,
        attendee_name: `${targetUser.f_name || ''} ${targetUser.l_name || ''}`.trim(),
        attendee_email: targetUser.email,
        scanned_by: user_id,
    };
}

async function getEventAttendees(eventId) {
    const rows = await prisma.tbl_event_attendance.findMany({
        where: {
            event_id: Number(eventId),
            deleted_at: null,
        },
        orderBy: [{ created_at: 'asc' }, { attendance_id: 'asc' }],
        select: {
            attendance_id: true,
            user_id: true,
            status: true,
            time_in: true,
            time_out: true,
            created_at: true,
            tbl_user: {
                select: {
                    f_name: true,
                    l_name: true,
                    email: true,
                },
            },
        },
    });

    return rows.map((row) => ({
        attendance_id: row.attendance_id,
        user_id: row.user_id,
        status: row.status,
        time_in: row.time_in,
        time_out: row.time_out,
        created_at: row.created_at,
        f_name: row.tbl_user?.f_name || '',
        l_name: row.tbl_user?.l_name || '',
        email: row.tbl_user?.email || '',
    }));
}

async function updateMemberEventStatus(user_id, event_id) {
    const attendance = await prisma.tbl_event_attendance.findFirst({
        where: {
            event_id: Number(event_id),
            user_id,
            deleted_at: null,
        },
        orderBy: { attendance_id: 'desc' },
        select: { attendance_id: true },
    });

    if (!attendance) return null;

    return prisma.tbl_event_attendance.update({
        where: { attendance_id: attendance.attendance_id },
        data: {
            status: 'Evaluated',
            updated_at: new Date(),
        },
    });
}

async function resolvePaymentTypeId(paymentMethod) {
    if (!paymentMethod) {
        const fallback = await prisma.tbl_payment_type.findFirst({ select: { payment_type_id: true } });
        return fallback?.payment_type_id;
    }

    const normalized = String(paymentMethod).trim();
    const byCode = await prisma.tbl_payment_type.findFirst({
        where: { code: { equals: normalized, mode: 'insensitive' } },
        select: { payment_type_id: true },
    });
    if (byCode?.payment_type_id) return byCode.payment_type_id;

    const byLabel = await prisma.tbl_payment_type.findFirst({
        where: { label: { equals: normalized, mode: 'insensitive' } },
        select: { payment_type_id: true },
    });
    if (byLabel?.payment_type_id) return byLabel.payment_type_id;

    const fallback = await prisma.tbl_payment_type.findFirst({ select: { payment_type_id: true } });
    return fallback?.payment_type_id;
}

async function resolveIncomeTypeId() {
    const byCode = await prisma.tbl_transaction_type.findFirst({
        where: { code: { equals: 'INCOME', mode: 'insensitive' } },
        select: { transaction_type_id: true },
    });
    if (byCode?.transaction_type_id) return byCode.transaction_type_id;

    const fallback = await prisma.tbl_transaction_type.findFirst({ select: { transaction_type_id: true } });
    return fallback?.transaction_type_id;
}

async function createEventTransaction(userEmail, payerName, amount, paymentMethod, proofImage, eventId, organizationId, organizationVersionId) {
    const user = await prisma.tbl_user.findUnique({
        where: { email: userEmail },
        select: { user_id: true },
    });

    const payment_type_id = await resolvePaymentTypeId(paymentMethod);
    const transaction_type_id = await resolveIncomeTypeId();

    if (!payment_type_id || !transaction_type_id) {
        throw new Error('Transaction/payment type configuration is missing');
    }

    try {
        const tx = await prisma.tbl_transaction.create({
            data: {
                user_id: user?.user_id || null,
                payer_name: payerName || null,
                payee_name: null,
                payment_description: `Event Registration #${eventId}`,
                amount,
                transaction_type_id,
                payment_type_id,
                category_id: null,
                org_version_id: organizationVersionId ? Number(organizationVersionId) : null,
                status: 'Pending',
                transaction_date: new Date(),
                proof_image: proofImage || null,
            },
            select: {
                transaction_id: true,
            },
        });

        await prisma.tbl_transaction_event.create({
            data: {
                transaction_id: tx.transaction_id,
                event_id: Number(eventId),
                remarks: 'Mobile event registration payment',
                payer_name_override: payerName || null,
            },
        });

        // Keep legacy return shape that controller extractor can read.
        return [[[{ transaction_id: tx.transaction_id }]]];
    } catch (error) {
        console.error('Error creating event transaction:', error);
        throw error;
    }
}

async function approveTransaction(params) {
  const {
    transaction_id,
    category,
  } = params;

  const nextStatus = String(category).toUpperCase() === 'APPROVE' ? 'Completed' : 'Failed';

  return prisma.tbl_transaction.update({
    where: { transaction_id: Number(transaction_id) },
    data: {
      status: nextStatus,
      updated_at: new Date(),
    },
  });
}


module.exports = {
    getAllEvents,
    registerEvent,
    getSpecificEvent,
    checkEventRegistration,
    getTickets,
    getUpcomingEvents,
    addGeneratedCertificate,
    getEvaluation,
    submitEvaluation,
    getAllEventCertificates,
    scanTicket,
    getEventAttendees,
    unregisterEvent,
    updateMemberEventStatus,
    createEventTransaction,
    approveTransaction,
    getCertificateTemplate,
};
