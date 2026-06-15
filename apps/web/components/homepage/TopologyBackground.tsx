"use client";

import React, { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  isRed: boolean;
  pulseTimer: number;
}

export function TopologyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const nodes: Node[] = [];
    const numNodes = Math.floor((width * height) / 15000); // Density
    const maxDistance = 150;

    let mouseX = width / 2;
    let mouseY = height / 2;

    const initNodes = () => {
      nodes.length = 0;
      for (let i = 0; i < numNodes; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          radius: Math.random() * 1.5 + 0.5,
          baseRadius: Math.random() * 1.5 + 0.5,
          isRed: Math.random() > 0.95, // 5% chance to be an active red node
          pulseTimer: Math.random() * 100,
        });
      }
    };

    initNodes();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      initNodes();
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            
            // Check if either node is "active" (red) to create a glowing connection
            const isActive = nodes[i].isRed || nodes[j].isRed;
            const opacity = 1 - dist / maxDistance;
            
            if (isActive) {
               ctx.strokeStyle = `rgba(232, 65, 74, ${opacity * 0.3})`; // #E8414A (Red)
               ctx.lineWidth = 1;
            } else {
               ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.05})`; // Subtle white
               ctx.lineWidth = 0.5;
            }
            ctx.stroke();
          }
        }
      }

      // Draw nodes and update
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Update position
        node.x += node.vx;
        node.y += node.vy;

        // Bounce off edges
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        // Mouse interaction
        const dx = mouseX - node.x;
        const dy = mouseY - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 200) {
          const force = (200 - dist) / 200;
          node.x -= dx * force * 0.01;
          node.y -= dy * force * 0.01;
        }

        // Red node pulsing logic
        if (node.isRed) {
          node.pulseTimer += 0.05;
          node.radius = node.baseRadius + Math.sin(node.pulseTimer) * 1.5;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(0.1, node.radius), 0, Math.PI * 2);
        if (node.isRed) {
          ctx.fillStyle = `rgba(232, 65, 74, ${0.5 + Math.sin(node.pulseTimer) * 0.5})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#E8414A";
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
          ctx.shadowBlur = 0;
        }
        ctx.fill();
        ctx.shadowBlur = 0; // reset for next drawing
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none opacity-60 mix-blend-screen"
      style={{ background: "transparent" }}
    />
  );
}
