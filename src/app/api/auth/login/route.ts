import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { findUserByUsername, createUser } from '@/lib/users';

export async function POST(request: NextRequest) {
  try {
    const { username, password, deviceType } = await request.json();

    console.log(`Login attempt for user: ${username}, device: ${deviceType}`);

    if (!username || !password || !deviceType) {
      return NextResponse.json(
        { error: 'Username, password, and device type are required' },
        { status: 400 }
      );
    }

    // Check if JWT_SECRET is available
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Check if user exists
    const existingUser = await findUserByUsername(username);

    if (existingUser) {
      console.log(`Existing user found: ${existingUser.id}`);
      // Verify password
      const isValid = await bcrypt.compare(password, existingUser.password);
      if (!isValid) {
        console.log(`Invalid password for user: ${username}`);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: existingUser.id, deviceType, username },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log(`Login successful for existing user: ${username}`);
      return NextResponse.json({
        token,
        userId: existingUser.id,
        username: existingUser.username,
        deviceType
      });
    } else {
      console.log(`Creating new user: ${username}`);
      // Create new user
      const hashedPassword = await bcrypt.hash(password, 12);
      const userId = uuidv4();

      await createUser({
        id: userId,
        username,
        password: hashedPassword
      });

      console.log(`New user created and persisted: ${userId}`);

      // Generate JWT token
      const token = jwt.sign(
        { userId, deviceType, username },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log(`Login successful for new user: ${username}`);
      return NextResponse.json({
        token,
        userId,
        username,
        deviceType
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
