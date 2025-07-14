// server.js - InstantExpert Backend
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')('sk_test_YOUR_STRIPE_SECRET_KEY'); // Replace with your secret key
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve your HTML file from public folder

// Email configuration
const transporter = nodemailer.createTransporter({
    service: 'gmail', // or your email service
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password'
    }
});

// Expert database (replace with real database)
const experts = {
    business: [
        { 
            id: 1, 
            name: 'Sarah Chen', 
            title: 'Ex-McKinsey Partner', 
            rating: 4.9, 
            rate: 12, 
            experience: '15 years strategy consulting', 
            avatar: 'SC',
            email: 'sarah@instantexpert.io',
            calendar: 'https://calendly.com/sarah-chen'
        },
        { 
            id: 2, 
            name: 'Marcus Johnson', 
            title: 'Serial Entrepreneur', 
            rating: 4.8, 
            rate: 10, 
            experience: '3 successful exits', 
            avatar: 'MJ',
            email: 'marcus@instantexpert.io',
            calendar: 'https://calendly.com/marcus-johnson'
        }
    ],
    tech: [
        { 
            id: 3, 
            name: 'Alex Kumar', 
            title: 'Senior Developer', 
            rating: 4.9, 
            rate: 8, 
            experience: 'Google, Meta, 10+ years', 
            avatar: 'AK',
            email: 'alex@instantexpert.io',
            calendar: 'https://calendly.com/alex-kumar'
        }
    ],
    // Add more categories...
};

// Bookings storage (replace with real database)
let bookings = [];

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'InstantExpert API is running' });
});

// Get experts by category
app.get('/api/experts/:category', (req, res) => {
    const { category } = req.params;
    const categoryExperts = experts[category] || [];
    
    // Simulate AI matching - return experts sorted by rating
    const matchedExperts = categoryExperts
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3); // Return top 3 matches
    
    res.json({ experts: matchedExperts });
});

// Create booking and process payment
app.post('/api/create-booking', async (req, res) => {
    try {
        const { token, expert, problem, email, estimatedDuration = 15 } = req.body;
        
        // Calculate amount (in cents)
        const amount = expert.rate * estimatedDuration * 100;
        
        // Create Stripe charge
        const charge = await stripe.charges.create({
            amount: amount,
            currency: 'usd',
            description: `InstantExpert consultation with ${expert.name}`,
            source: token,
            metadata: {
                expert_id: expert.id.toString(),
                customer_email: email,
                problem: problem.substring(0, 500) // Stripe metadata limit
            }
        });
        
        // Create booking record
        const booking = {
            id: uuidv4(),
            expertId: expert.id,
            expertName: expert.name,
            customerEmail: email,
            problem: problem,
            amount: amount / 100,
            duration: estimatedDuration,
            status: 'confirmed',
            chargeId: charge.id,
            createdAt: new Date().toISOString(),
            zoomMeeting: null // Will be populated when meeting is created
        };
        
        // Store booking
        bookings.push(booking);
        
        // Create Zoom meeting
        const zoomMeeting = await createZoomMeeting(booking);
        booking.zoomMeeting = zoomMeeting;
        
        // Send confirmation emails
        await sendConfirmationEmails(booking, expert);
        
        res.json({
            success: true,
            booking: {
                id: booking.id,
                zoomId: zoomMeeting.meetingId,
                zoomPassword: zoomMeeting.password,
                zoomUrl: zoomMeeting.joinUrl
            }
        });
        
    } catch (error) {
        console.error('Booking creation failed:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Create Zoom meeting (simplified - you'll need Zoom API credentials)
async function createZoomMeeting(booking) {
    // For now, return mock data
    // In production, integrate with Zoom API:
    // https://marketplace.zoom.us/docs/api-reference/zoom-api/meetings/meetingcreate
    
    const meetingId = Math.floor(Math.random() * 900000000) + 100000000;
    const password = Math.random().toString(36).substring(2, 8);
    
    return {
        meetingId: meetingId.toString(),
        password: password,
        joinUrl: `https://zoom.us/j/${meetingId}?pwd=${password}`,
        startTime: new Date().toISOString(),
        topic: `InstantExpert consultation with ${booking.expertName}`
    };
}

// Send confirmation emails
async function sendConfirmationEmails(booking, expert) {
    // Email to customer
    const customerEmailOptions = {
        from: 'noreply@instantexpert.io',
        to: booking.customerEmail,
        subject: 'Your InstantExpert consultation is confirmed!',
        html: `
            <h2>🎉 Your expert consultation is ready!</h2>
            <p>Hi there,</p>
            <p>Your consultation with <strong>${booking.expertName}</strong> has been confirmed.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>📞 Meeting Details:</h3>
                <p><strong>Meeting ID:</strong> ${booking.zoomMeeting.meetingId}</p>
                <p><strong>Password:</strong> ${booking.zoomMeeting.password}</p>
                <p><strong>Join URL:</strong> <a href="${booking.zoomMeeting.joinUrl}">Click to join</a></p>
            </div>
            
            <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>💡 Your Problem:</h3>
                <p>${booking.problem}</p>
            </div>
            
            <p><strong>Duration:</strong> ${booking.duration} minutes (estimated)</p>
            <p><strong>Rate:</strong> $${expert.rate}/minute</p>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            
            <p>Your expert will join the call shortly. Please be ready at the scheduled time!</p>
            
            <p>Best regards,<br>The InstantExpert Team</p>
        `
    };
    
    // Email to expert
    const expertEmailOptions = {
        from: 'noreply@instantexpert.io',
        to: expert.email,
        subject: 'New consultation booked - Ready to help!',
        html: `
            <h2>💼 New Consultation Booked</h2>
            <p>Hi ${expert.name},</p>
            <p>You have a new consultation request!</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>📞 Meeting Details:</h3>
                <p><strong>Meeting ID:</strong> ${booking.zoomMeeting.meetingId}</p>
                <p><strong>Password:</strong> ${booking.zoomMeeting.password}</p>
                <p><strong>Join URL:</strong> <a href="${booking.zoomMeeting.joinUrl}">Click to join</a></p>
            </div>
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>🔍 Customer's Problem:</h3>
                <p>${booking.problem}</p>
            </div>
            
            <p><strong>Customer Email:</strong> ${booking.customerEmail}</p>
            <p><strong>Duration:</strong> ${booking.duration} minutes (estimated)</p>
            <p><strong>Your Rate:</strong> $${expert.rate}/minute</p>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            
            <p>Please join the call on time and provide excellent service!</p>
            
            <p>Best regards,<br>The InstantExpert Team</p>
        `
    };
    
    try {
        await transporter.sendMail(customerEmailOptions);
        await transporter.sendMail(expertEmailOptions);
        console.log(`Confirmation emails sent for booking ${booking.id}`);
    } catch (error) {
        console.error('Failed to send emails:', error);
    }
}

// Get booking details
app.get('/api/booking/:id', (req, res) => {
    const { id } = req.params;
    const booking = bookings.find(b => b.id === id);
    
    if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json({ booking });
});

// Webhook for Stripe events (optional but recommended)
app.post('/api/webhook', express.raw({type: 'application/json'}), (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    try {
        const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        
        switch (event.type) {
            case 'charge.succeeded':
                console.log('Payment succeeded:', event.data.object.id);
                break;
            case 'charge.failed':
                console.log('Payment failed:', event.data.object.id);
                break;
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
        
        res.json({received: true});
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

// Expert onboarding endpoint
app.post('/api/experts/apply', async (req, res) => {
    const { name, email, category, experience, rate, calendlyLink } = req.body;
    
    // Store expert application (you'd save this to a database)
    const application = {
        id: uuidv4(),
        name,
        email,
        category,
        experience,
        rate,
        calendlyLink,
        status: 'pending',
        appliedAt: new Date().toISOString()
    };
    
    // Send notification email to admin
    try {
        await transporter.sendMail({
            from: 'noreply@instantexpert.io',
            to: 'admin@instantexpert.io',
            subject: 'New Expert Application',
            html: `
                <h2>New Expert Application</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Category:</strong> ${category}</p>
                <p><strong>Experience:</strong> ${experience}</p>
                <p><strong>Proposed Rate:</strong> $${rate}/minute</p>
                <p><strong>Calendly:</strong> ${calendlyLink}</p>
            `
        });
    } catch (error) {
        console.error('Failed to send application email:', error);
    }
    
    res.json({
        success: true,
        message: 'Application submitted successfully',
        applicationId: application.id
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`InstantExpert server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
