# auth_wrapper.py
# Flexible authentication system for The Fractality Project

import hashlib
import secrets
import jwt
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from abc import ABC, abstractmethod
import re

class AuthProvider(ABC):
    """Base class for authentication providers"""
    
    @abstractmethod
    async def authenticate(self, credentials: Dict) -> Dict:
        """Authenticate user and return auth data"""
        pass
        
    @abstractmethod
    async def validate_token(self, token: str) -> Optional[str]:
        """Validate session token and return user ID"""
        pass
        
    @abstractmethod
    async def refresh_token(self, refresh_token: str) -> Optional[Dict]:
        """Refresh authentication tokens"""
        pass

class EmailAuthProvider(AuthProvider):
    """Traditional email/password authentication"""
    
    def __init__(self, secret_key: str = None):
        self.secret_key = secret_key or secrets.token_urlsafe(32)
        self.password_store = {}  # In production, use proper database
        
    def _hash_password(self, password: str, salt: str = None) -> Tuple[str, str]:
        """Hash password with salt"""
        if not salt:
            salt = secrets.token_urlsafe(16)
        
        # Use PBKDF2 for password hashing
        password_hash = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000  # iterations
        ).hex()
        
        return password_hash, salt
        
    def _validate_email(self, email: str) -> bool:
        """Validate email format"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None
        
    def _validate_password(self, password: str) -> Tuple[bool, str]:
        """Validate password strength"""
        if len(password) < 8:
            return False, "Password must be at least 8 characters"
        if not any(c.isupper() for c in password):
            return False, "Password must contain at least one uppercase letter"
        if not any(c.islower() for c in password):
            return False, "Password must contain at least one lowercase letter"
        if not any(c.isdigit() for c in password):
            return False, "Password must contain at least one digit"
        return True, "Password is valid"
        
    async def register(self, email: str, password: str) -> Dict:
        """Register new user"""
        # Validate email
        if not self._validate_email(email):
            raise ValueError("Invalid email format")
            
        # Validate password
        valid, message = self._validate_password(password)
        if not valid:
            raise ValueError(message)
            
        # Check if already exists
        if email in self.password_store:
            raise ValueError("Email already registered")
            
        # Hash password
        password_hash, salt = self._hash_password(password)
        
        # Store credentials
        self.password_store[email] = {
            "password_hash": password_hash,
            "salt": salt,
            "created_at": datetime.utcnow()
        }
        
        return {
            "auth_id": email,
            "provider": "email",
            "message": "Registration successful"
        }
        
    async def authenticate(self, credentials: Dict) -> Dict:
        """Authenticate with email/password"""
        email = credentials.get("email")
        password = credentials.get("password")
        
        if not email or not password:
            raise ValueError("Email and password required")
            
        # Get stored credentials
        stored = self.password_store.get(email)
        if not stored:
            raise ValueError("Invalid credentials")
            
        # Verify password
        password_hash, _ = self._hash_password(password, stored["salt"])
        if password_hash != stored["password_hash"]:
            raise ValueError("Invalid credentials")
            
        # Generate tokens
        access_token = self._generate_token(email, "access", expires_in=3600)
        refresh_token = self._generate_token(email, "refresh", expires_in=86400*30)
        
        return {
            "auth_id": email,
            "provider": "email",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 3600
        }
        
    def _generate_token(self, user_id: str, token_type: str, expires_in: int) -> str:
        """Generate JWT token"""
        payload = {
            "user_id": user_id,
            "type": token_type,
            "exp": datetime.utcnow() + timedelta(seconds=expires_in),
            "iat": datetime.utcnow()
        }
        
        return jwt.encode(payload, self.secret_key, algorithm="HS256")
        
    async def validate_token(self, token: str) -> Optional[str]:
        """Validate access token"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=["HS256"])
            
            if payload.get("type") != "access":
                return None
                
            return payload.get("user_id")
            
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
            
    async def refresh_token(self, refresh_token: str) -> Optional[Dict]:
        """Refresh access token"""
        try:
            payload = jwt.decode(refresh_token, self.secret_key, algorithms=["HS256"])
            
            if payload.get("type") != "refresh":
                return None
                
            user_id = payload.get("user_id")
            
            # Generate new tokens
            new_access_token = self._generate_token(user_id, "access", expires_in=3600)
            new_refresh_token = self._generate_token(user_id, "refresh", expires_in=86400*30)
            
            return {
                "access_token": new_access_token,
                "refresh_token": new_refresh_token,
                "expires_in": 3600
            }
            
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

class Web3AuthProvider(AuthProvider):
    """Ethereum wallet-based authentication"""
    
    def __init__(self):
        self.nonce_store = {}  # Temporary nonces for signing
        
    async def get_nonce(self, wallet_address: str) -> str:
        """Get nonce for wallet to sign"""
        # Validate ethereum address
        if not self._is_valid_address(wallet_address):
            raise ValueError("Invalid Ethereum address")
            
        # Generate nonce
        nonce = secrets.token_urlsafe(32)
        self.nonce_store[wallet_address.lower()] = {
            "nonce": nonce,
            "created_at": datetime.utcnow()
        }
        
        return nonce
        
    def _is_valid_address(self, address: str) -> bool:
        """Validate Ethereum address format"""
        if not address.startswith("0x"):
            return False
        if len(address) != 42:
            return False
        try:
            int(address, 16)
            return True
        except ValueError:
            return False
            
    async def authenticate(self, credentials: Dict) -> Dict:
        """Authenticate with signed message"""
        wallet_address = credentials.get("address", "").lower()
        signature = credentials.get("signature")
        
        if not wallet_address or not signature:
            raise ValueError("Address and signature required")
            
        # Get stored nonce
        stored = self.nonce_store.get(wallet_address)
        if not stored:
            raise ValueError("No nonce found - request nonce first")
            
        # Check nonce age (5 minutes max)
        if (datetime.utcnow() - stored["created_at"]).seconds > 300:
            del self.nonce_store[wallet_address]
            raise ValueError("Nonce expired")
            
        # In production, verify signature using web3.py or ethers
        # For now, we'll simulate verification
        expected_message = f"Sign this message to authenticate: {stored['nonce']}"
        
        # Simulate signature verification
        if len(signature) != 132:  # Basic check
            raise ValueError("Invalid signature")
            
        # Clean up nonce
        del self.nonce_store[wallet_address]
        
        # Generate tokens
        access_token = self._generate_token(wallet_address)
        
        return {
            "auth_id": wallet_address,
            "provider": "web3",
            "access_token": access_token,
            "expires_in": 86400  # 24 hours for Web3
        }
        
    def _generate_token(self, wallet_address: str) -> str:
        """Generate simple token for Web3 auth"""
        # In production, use JWT like email auth
        return f"{wallet_address}:{secrets.token_urlsafe(32)}"
        
    async def validate_token(self, token: str) -> Optional[str]:
        """Validate Web3 token"""
        try:
            wallet_address, _ = token.split(":")
            if self._is_valid_address(wallet_address):
                return wallet_address
        except:
            pass
        return None
        
    async def refresh_token(self, refresh_token: str) -> Optional[Dict]:
        """Web3 doesn't use refresh tokens - sign in again"""
        return None

class SessionManager:
    """Manage user sessions across all auth providers"""
    
    def __init__(self):
        self.providers = {}
        self.sessions = {}  # token -> session data
        self.user_sessions = {}  # consciousness_id -> set of tokens
        
    def register_provider(self, name: str, provider: AuthProvider):
        """Register an auth provider"""
        self.providers[name] = provider
        
    async def authenticate(self, provider_name: str, credentials: Dict) -> Dict:
        """Authenticate through specified provider"""
        if provider_name not in self.providers:
            raise ValueError(f"Unknown auth provider: {provider_name}")
            
        provider = self.providers[provider_name]
        auth_result = await provider.authenticate(credentials)
        
        return auth_result
        
    async def validate_session(self, token: str) -> Optional[Dict]:
        """Validate session token"""
        # Check session store first
        if token in self.sessions:
            session = self.sessions[token]
            if session["expires_at"] > datetime.utcnow():
                return session
            else:
                # Session expired
                del self.sessions[token]
                
        # Try each provider
        for provider_name, provider in self.providers.items():
            user_id = await provider.validate_token(token)
            if user_id:
                # Create session
                session = {
                    "auth_id": user_id,
                    "provider": provider_name,
                    "created_at": datetime.utcnow(),
                    "expires_at": datetime.utcnow() + timedelta(hours=24)
                }
                self.sessions[token] = session
                return session
                
        return None
        
    def revoke_session(self, token: str):
        """Revoke a session"""
        if token in self.sessions:
            session = self.sessions[token]
            consciousness_id = session.get("consciousness_id")
            
            # Remove from user sessions
            if consciousness_id and consciousness_id in self.user_sessions:
                self.user_sessions[consciousness_id].discard(token)
                
            # Remove session
            del self.sessions[token]
            
    def revoke_all_user_sessions(self, consciousness_id: str):
        """Revoke all sessions for a user"""
        if consciousness_id in self.user_sessions:
            tokens = list(self.user_sessions[consciousness_id])
            for token in tokens:
                self.revoke_session(token)
                
    def get_active_sessions(self, consciousness_id: str) -> List[Dict]:
        """Get all active sessions for a user"""
        active = []
        
        if consciousness_id in self.user_sessions:
            for token in self.user_sessions[consciousness_id]:
                if token in self.sessions:
                    session = self.sessions[token]
                    if session["expires_at"] > datetime.utcnow():
                        active.append({
                            "provider": session["provider"],
                            "created_at": session["created_at"],
                            "expires_at": session["expires_at"]
                        })
                        
        return active