const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"TalentFlow" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html
    });
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendWelcomeEmail = async (user) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 30px;">
        <h1 style="color: #4F46E5;">Welcome to TalentFlow!</h1>
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Your account has been successfully created. You are now part of the TalentFlow learning community.</p>
        <p>Start exploring courses and level up your skills today!</p>
        <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard"
           style="display:inline-block;margin-top:20px;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;">
          Go to Dashboard
        </a>
        <p style="margin-top: 30px; color: #888; font-size: 12px;">
          If you did not create this account, please ignore this email.
        </p>
      </div>
    </body>
    </html>
  `;
  return sendEmail({
    to: user.email,
    subject: 'Welcome to TalentFlow!',
    html,
    text: `Welcome to TalentFlow, ${user.name}! Your account has been created successfully.`
  });
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 30px;">
        <h1 style="color: #4F46E5;">Password Reset Request</h1>
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>You requested a password reset for your TalentFlow account.</p>
        <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block;margin-top:20px;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;">
          Reset Password
        </a>
        <p style="margin-top: 20px; color: #666; font-size: 13px;">
          Or copy and paste this URL into your browser:<br>
          <a href="${resetUrl}" style="color: #4F46E5;">${resetUrl}</a>
        </p>
        <p style="margin-top: 30px; color: #888; font-size: 12px;">
          If you did not request this reset, please ignore this email. Your password will remain unchanged.
        </p>
      </div>
    </body>
    </html>
  `;
  return sendEmail({
    to: user.email,
    subject: 'TalentFlow — Password Reset Request',
    html,
    text: `Password reset link: ${resetUrl}. This link expires in 1 hour.`
  });
};

const sendCertificateEmail = async (user, course, certificate) => {
  const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify/${certificate.certificateId}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 30px;">
        <h1 style="color: #4F46E5;">Congratulations! Certificate Issued</h1>
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>You have successfully completed the course: <strong>${course.title}</strong>!</p>
        <p>Your certificate ID: <code style="background:#f0f0f0;padding:4px 8px;border-radius:4px;">${certificate.certificateId}</code></p>
        <a href="${verifyUrl}"
           style="display:inline-block;margin-top:20px;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;">
          View Certificate
        </a>
        <p style="margin-top: 30px; color: #888; font-size: 12px;">
          Issued on: ${new Date(certificate.issuedAt).toLocaleDateString()}
        </p>
      </div>
    </body>
    </html>
  `;
  return sendEmail({
    to: user.email,
    subject: `TalentFlow — Certificate for "${course.title}"`,
    html,
    text: `Congratulations ${user.name}! You completed "${course.title}". Certificate ID: ${certificate.certificateId}`
  });
};

const sendAssignmentGradedEmail = async (user, assignment, submission) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 30px;">
        <h1 style="color: #4F46E5;">Assignment Graded</h1>
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Your submission for <strong>${assignment.title}</strong> has been graded.</p>
        <div style="background: #f8f8f8; border-left: 4px solid #4F46E5; padding: 16px; margin: 20px 0;">
          <p style="margin:0;font-size:18px;"><strong>Score: ${submission.grade} / ${assignment.maxScore}</strong></p>
          ${submission.feedback ? `<p style="margin:8px 0 0;color:#666;">Feedback: ${submission.feedback}</p>` : ''}
        </div>
        <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/assignments"
           style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;">
          View Submission
        </a>
      </div>
    </body>
    </html>
  `;
  return sendEmail({
    to: user.email,
    subject: `TalentFlow — Assignment Graded: ${assignment.title}`,
    html,
    text: `Your assignment "${assignment.title}" has been graded. Score: ${submission.grade}/${assignment.maxScore}.`
  });
};

const sendCourseEnrollmentEmail = async (user, course) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f4f4f4; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 8px; padding: 30px;">
        <h1 style="color: #4F46E5;">Course Enrollment Confirmed</h1>
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>You have successfully enrolled in: <strong>${course.title}</strong>.</p>
        <div style="background: #f8f8f8; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <p style="margin:0;"><strong>Category:</strong> ${course.category}</p>
          <p style="margin:8px 0 0;"><strong>Level:</strong> ${course.level}</p>
        </div>
        <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/courses/${course._id}"
           style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;">
          Start Learning
        </a>
      </div>
    </body>
    </html>
  `;
  return sendEmail({
    to: user.email,
    subject: `TalentFlow — Enrolled in "${course.title}"`,
    html,
    text: `You have successfully enrolled in "${course.title}". Start learning now!`
  });
};

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendCertificateEmail,
  sendAssignmentGradedEmail,
  sendCourseEnrollmentEmail
};
